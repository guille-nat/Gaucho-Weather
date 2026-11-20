"""Subscriptions and payments charged through a payment provider (pagos-backoffice S2).

The provider is the source of truth: these rows mirror what its API returned, and the
webhook updates them by the provider's own ids, so a repeated notification changes nothing.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Provider(models.TextChoices):
    MERCADOPAGO = "mercadopago", "Mercado Pago"


class ProviderSubscription(models.Model):
    """A monthly charge for one plan at one provider (a Mercado Pago preapproval)."""

    class Status(models.TextChoices):
        PENDING = "pending", "pendiente de pago"
        AUTHORIZED = "authorized", "activa"
        PAUSED = "paused", "pausada"
        CANCELLED = "cancelled", "cancelada"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="provider_subscriptions",
        verbose_name="usuario",
    )
    plan = models.ForeignKey(
        "accounts.Plan",
        to_field="code",
        on_delete=models.PROTECT,
        related_name="+",
        verbose_name="plan",
    )
    provider = models.CharField("pasarela", max_length=20, choices=Provider.choices)
    currency = models.CharField("moneda", max_length=3, default="ARS")
    amount = models.PositiveIntegerField("monto mensual")
    external_id = models.CharField("id en la pasarela", max_length=100, unique=True)
    status = models.CharField(
        "estado", max_length=12, choices=Status.choices, default=Status.PENDING
    )
    checkout_url = models.URLField("link de pago", max_length=500, blank=True)
    next_payment_at = models.DateTimeField("próximo cobro", null=True, blank=True)
    # Set once a cancelled subscription has finished: its paid period is over and the account
    # went back to Básico (or never had the plan). The expiry task skips it from then on.
    ended_at = models.DateTimeField("terminó", null=True, blank=True)
    created_at = models.DateTimeField("creada", default=timezone.now)
    updated_at = models.DateTimeField("actualizada", auto_now=True)

    class Meta:
        verbose_name = "suscripción paga"
        verbose_name_plural = "suscripciones pagas"
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.user} → {self.plan_id} ({self.get_status_display()})"


class Payment(models.Model):
    """One charge reported by the provider: approved, rejected, refunded..."""

    class Status(models.TextChoices):
        APPROVED = "approved", "aprobado"
        PENDING = "pending", "pendiente"
        REJECTED = "rejected", "rechazado"
        REFUNDED = "refunded", "devuelto"
        CANCELLED = "cancelled", "cancelado"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payments",
        verbose_name="usuario",
    )
    subscription = models.ForeignKey(
        ProviderSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
        verbose_name="suscripción",
    )
    provider = models.CharField("pasarela", max_length=20, choices=Provider.choices)
    external_id = models.CharField("id en la pasarela", max_length=100, unique=True)
    amount = models.DecimalField("monto", max_digits=12, decimal_places=2)
    currency = models.CharField("moneda", max_length=3, default="ARS")
    status = models.CharField("estado", max_length=12, choices=Status.choices)
    paid_at = models.DateTimeField("pagado el", null=True, blank=True)
    # What the provider's API returned, for support. Never sent to the browser.
    payload = models.JSONField("respuesta de la pasarela", default=dict, blank=True)
    created_at = models.DateTimeField("registrado", default=timezone.now)

    class Meta:
        verbose_name = "pago"
        verbose_name_plural = "pagos"
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.user}: {self.amount} {self.currency} ({self.get_status_display()})"
