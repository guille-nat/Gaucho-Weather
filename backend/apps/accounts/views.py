from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import enforce_csrf
from .models import FounderProgram, Plan
from .serializers import LoginSerializer, PlanSerializer, RegisterSerializer, UserSerializer
from .throttling import IPScopedRateThrottle

BAD_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos."


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


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class PlansView(APIView):
    """Public price table: the three plans and how many founder slots are left."""

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
            }
        )
