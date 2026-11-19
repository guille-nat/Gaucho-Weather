import logging

from django.contrib.auth import (
    authenticate,
    login,
    logout,
    password_validation,
    update_session_auth_hash,
)
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.payments.providers import payments_enabled

from . import password_reset, plans
from .authentication import enforce_csrf
from .models import FounderProgram, Plan
from .serializers import (
    AccountUpdateSerializer,
    DeleteAccountSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PlanRequestCreateSerializer,
    PlanRequestSerializer,
    PlanSerializer,
    RegisterSerializer,
    SubscriptionSerializer,
    UserSerializer,
)
from .throttling import IPScopedRateThrottle

logger = logging.getLogger(__name__)

BAD_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos."
BAD_RESET_LINK = "El enlace no es válido o venció. Pedí uno nuevo."


class CsrfProtectedView(APIView):
    """Anonymous endpoints that still require the CSRF token (login CSRF)."""

    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        enforce_csrf(request)


class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        get_token(request)  # makes CsrfViewMiddleware set the csrftoken cookie
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(CsrfProtectedView):
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(CsrfProtectedView):
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            email=serializer.validated_data["email"].strip(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response({"detail": BAD_CREDENTIALS_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(CsrfProtectedView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordCheckThrottle(IPScopedRateThrottle):
    """Throttles only the requests that check the password, in the login bucket.

    Reading the account, renaming it or changing the notification choices stays free; a
    PATCH counts only when it carries `current_password`. The scope comes from the view's
    `throttle_scope`.
    """

    def allow_request(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.method == "PATCH" and "current_password" not in request.data:
            return True
        return super().allow_request(request, view)


class MeView(APIView):
    throttle_classes = [PasswordCheckThrottle]
    throttle_scope = "login"

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = AccountUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)

    def delete(self, request):
        """Deletes the account and everything it owns. A founder slot is not handed out again."""
        serializer = DeleteAccountSerializer(data=request.data, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            request.user.delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeView(APIView):
    throttle_classes = [PasswordCheckThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"user": request.user})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        # Keeps this session; every other session of the account is signed out.
        update_session_auth_hash(request, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlansView(APIView):
    """Public price table: the plans, founder slots left and whether payments are on."""

    permission_classes = [AllowAny]
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "plans"

    def get(self, request):
        program = FounderProgram.objects.filter(pk=1).first() or FounderProgram()
        return Response(
            {
                "plans": PlanSerializer(Plan.objects.all(), many=True).data,
                "founders": {"limit": program.limit, "remaining": program.remaining},
                "trial_days": program.trial_days,
                "payments_enabled": payments_enabled(),
            }
        )


class SubscriptionView(APIView):
    """S14: the account's plan, status, usage, pending request and plan history."""

    def get(self, request):
        return Response(SubscriptionSerializer(request.user).data)


NO_PENDING_REQUEST = "No tenés un pedido pendiente."


class PlanRequestView(APIView):
    """S14: ask for another plan or to cancel down to Básico; staff apply it in the admin."""

    def post(self, request):
        serializer = PlanRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plan_request = plans.request_plan(request.user, data["kind"], data.get("plan"))
        except plans.PlanRequestError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(PlanRequestSerializer(plan_request).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        if not plans.withdraw_request(request.user):
            return Response({"detail": NO_PENDING_REQUEST}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetView(CsrfProtectedView):
    """Always 204: the answer never tells whether the email has an account."""

    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        from .tasks import send_password_reset

        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            send_password_reset.delay(serializer.validated_data["email"])
        except Exception:
            # Still 204: a 500 here would tell apart "queued" from "queue down" and break
            # the always-the-same answer. The log is how staff learn the queue is down.
            logger.exception("Could not queue the password reset email")
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(CsrfProtectedView):
    throttle_classes = [IPScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = password_reset.user_for_link(data["uid"], data["token"])
        if user is None:
            return Response({"detail": BAD_RESET_LINK}, status=status.HTTP_400_BAD_REQUEST)
        try:
            password_validation.validate_password(data["new_password"], user=user)
        except DjangoValidationError as exc:
            return Response(
                {"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST
            )
        # Changing the password also ends every session and spends the link.
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
