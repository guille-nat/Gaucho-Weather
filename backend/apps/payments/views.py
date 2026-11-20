import logging

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import terms
from apps.accounts.models import TermsAcceptance

from . import services
from .providers import get_provider, payments_enabled
from .providers.base import InvalidSignature, ProviderError
from .serializers import PaymentSerializer, ProviderSubscriptionSerializer, SubscribeSerializer

logger = logging.getLogger(__name__)

PAYMENTS_SHOWN = 50


def refusal(exc: services.PaymentRefusal) -> Response:
    return Response({"detail": exc.detail}, status=exc.status)


def my_payments(user) -> dict:
    sub = services.current_subscription(user)
    payments = user.payments.all()[:PAYMENTS_SHOWN]
    return {
        "payments_enabled": payments_enabled(),
        "subscription": ProviderSubscriptionSerializer(sub).data if sub else None,
        "payments": PaymentSerializer(payments, many=True).data,
    }


class MyPaymentsView(APIView):
    """GET /api/pagos/: the account's current subscription and its payments."""

    def get(self, request):
        return Response(my_payments(request.user))


class SubscribeView(APIView):
    """POST /api/pagos/suscribirme/ {plan, currency, acepta_terminos}: 201 {checkout_url}.

    The terms acceptance is recorded only when the checkout is handed out (promociones S0b).
    """

    def post(self, request):
        serializer = SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            sub = services.subscribe(request.user, data["plan"], data["currency"])
        except services.PaymentRefusal as exc:
            return refusal(exc)
        terms.record_acceptance(request.user, TermsAcceptance.Context.SUBSCRIBE)
        return Response({"checkout_url": sub.checkout_url}, status=status.HTTP_201_CREATED)


class CancelView(APIView):
    """POST /api/pagos/cancelar/: cancel at the provider; the paid month is kept."""

    def post(self, request):
        try:
            services.cancel(request.user)
        except services.PaymentRefusal as exc:
            return refusal(exc)
        return Response(my_payments(request.user))


class MercadoPagoWebhookView(APIView):
    """Public and CSRF-exempt: the x-signature HMAC is the authentication."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        provider = get_provider("mercadopago")
        if not provider.is_configured():
            return Response({"detail": services.NOT_ENABLED}, status=503)
        try:
            event = provider.verify_webhook(request)
        except InvalidSignature:
            logger.warning("Mercado Pago webhook with a bad or missing signature")
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        if event is None:
            return Response(status=status.HTTP_200_OK)
        try:
            services.handle_event(provider, event)
        except ProviderError:
            # Not 2xx: Mercado Pago sends the notification again later.
            return Response({"detail": services.PROVIDER_DOWN}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(status=status.HTTP_200_OK)
