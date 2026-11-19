"""Payment providers, chosen by currency (pagos-backoffice S5)."""

from .base import PaymentProvider
from .mercadopago import MercadoPago

PROVIDERS = {MercadoPago.name: MercadoPago}

# Dollars have no provider yet: Mercado Pago Argentina only charges pesos
# (see Doc/funcionalidades/pagos.md).
PROVIDERS_BY_CURRENCY: dict[str, type[PaymentProvider]] = {"ARS": MercadoPago}


def get_provider(name: str) -> PaymentProvider:
    return PROVIDERS[name]()


def provider_for_currency(currency: str) -> PaymentProvider | None:
    provider = PROVIDERS_BY_CURRENCY.get(currency)
    return provider() if provider else None


def payments_enabled() -> bool:
    """True when at least one provider can take payments (the SPA shows "Suscribirme")."""
    return any(provider().is_configured() for provider in PROVIDERS_BY_CURRENCY.values())
