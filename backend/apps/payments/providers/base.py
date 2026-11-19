"""What every payment provider offers (pagos-backoffice S2, S5).

Mercado Pago charges pesos. Dollars need a second provider, still to be chosen: it implements
this same interface and is registered for "USD" in `providers.PROVIDERS_BY_CURRENCY`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


class ProviderError(Exception):
    """The provider could not be reached or answered with an error."""


class InvalidSignature(Exception):
    """A webhook whose signature is missing or does not match."""


@dataclass(frozen=True)
class Checkout:
    external_id: str
    checkout_url: str


@dataclass(frozen=True)
class RemoteSubscription:
    external_id: str
    status: str  # one of ProviderSubscription.Status
    next_payment_at: datetime | None


@dataclass(frozen=True)
class RemotePayment:
    external_id: str
    status: str  # one of Payment.Status
    amount: Decimal
    currency: str
    paid_at: datetime | None
    subscription_external_id: str | None
    payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class WebhookEvent:
    """A verified notification: what changed, by the provider's id. The body is not trusted."""

    kind: str  # SUBSCRIPTION, PAYMENT or INVOICE
    resource_id: str

    SUBSCRIPTION = "subscription"
    PAYMENT = "payment"
    INVOICE = "invoice"  # a subscription's charge: points to a payment and its subscription


class PaymentProvider(ABC):
    name: str

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def start_subscription(
        self,
        *,
        payer_email: str,
        reason: str,
        amount: int,
        currency: str,
        reference: str,
        back_url: str,
    ) -> Checkout: ...

    @abstractmethod
    def cancel_subscription(self, external_id: str) -> RemoteSubscription: ...

    @abstractmethod
    def fetch_subscription(self, external_id: str) -> RemoteSubscription: ...

    @abstractmethod
    def fetch_payment(self, external_id: str) -> RemotePayment: ...

    @abstractmethod
    def fetch_invoice(self, external_id: str) -> tuple[str | None, str | None]:
        """(payment id, subscription id) of a subscription charge; either may be unknown."""

    @abstractmethod
    def verify_webhook(self, request) -> WebhookEvent | None:
        """Check the signature (raises InvalidSignature) and say what changed.

        None: a verified notification about something this app does not track.
        """
