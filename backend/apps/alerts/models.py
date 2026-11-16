"""Custom alerts (odd/tasks/cuenta-planes-alertas.md S6, S7).

A rule is the farmer's own condition on one lote. The evaluator turns a rule that holds for a
day into one AlertEvent (the inbox row); delivery then sends it by push and email.
"""

from django.conf import settings
from django.db import models


class AlertRule(models.Model):
    class Variable(models.TextChoices):
        FROST = "frost", "Helada en el suelo"
        TEMP_MIN = "temp_min", "Temperatura mínima"
        TEMP_MAX = "temp_max", "Temperatura máxima"
        RAIN = "rain", "Lluvia del día"
        WIND = "wind", "Viento"
        SPRAY_WINDOW = "spray_window", "Ventana para pulverizar"

    class Comparator(models.TextChoices):
        LT = "lt", "menor a"
        LTE = "lte", "menor o igual a"
        GT = "gt", "mayor a"
        GTE = "gte", "mayor o igual a"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_rules",
        verbose_name="usuario",
    )
    lote = models.ForeignKey(
        "lotes.Lote", on_delete=models.CASCADE, related_name="alert_rules", verbose_name="lote"
    )
    variable = models.CharField("variable", max_length=20, choices=Variable.choices)
    # NULL, not "": the spray window has no comparison at all, and the API says so with null.
    comparator = models.CharField(  # noqa: DJ001
        "comparación", max_length=3, choices=Comparator.choices, null=True, blank=True
    )
    threshold = models.DecimalField("valor", max_digits=5, decimal_places=1, null=True, blank=True)
    enabled = models.BooleanField("activa", default=True)
    created_at = models.DateTimeField("creada", auto_now_add=True)

    class Meta:
        verbose_name = "regla de alerta"
        verbose_name_plural = "reglas de alerta"
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.get_variable_display()} en {self.lote}"


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "pendiente"
    SENDING = "sending", "enviando"
    SENT = "sent", "enviada"
    FAILED = "failed", "falló"
    SKIPPED = "skipped", "no corresponde"


class AlertEvent(models.Model):
    """One rule that held for one day: the inbox row and its delivery state."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_events",
        verbose_name="usuario",
    )
    rule = models.ForeignKey(
        AlertRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
        verbose_name="regla",
    )
    lote = models.ForeignKey(
        "lotes.Lote",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alert_events",
        verbose_name="lote",
    )
    target_date = models.DateField("día")
    title = models.CharField("título", max_length=120)
    body = models.TextField("texto")
    data = models.JSONField("datos", default=dict, blank=True)
    created_at = models.DateTimeField("creada", auto_now_add=True)
    read_at = models.DateTimeField("leída", null=True, blank=True)
    push_status = models.CharField(
        "push", max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    email_status = models.CharField(
        "email", max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    attempts = models.PositiveSmallIntegerField("intentos", default=0)

    class Meta:
        verbose_name = "alerta"
        verbose_name_plural = "alertas"
        ordering = ["-created_at", "-id"]
        constraints = [
            # Record first, then send: a second evaluation of the same day creates nothing.
            models.UniqueConstraint(
                fields=["rule", "target_date"], name="alert_event_once_per_rule_and_day"
            )
        ]

    def __str__(self) -> str:
        return self.title


class PushSubscription(models.Model):
    """A browser's Web Push endpoint for one account (the same phone may switch accounts)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
        verbose_name="usuario",
    )
    endpoint = models.URLField("endpoint", max_length=1000, unique=True)
    p256dh = models.CharField("clave p256dh", max_length=200)
    auth = models.CharField("clave auth", max_length=100)
    user_agent = models.CharField("navegador", max_length=300, blank=True)
    created_at = models.DateTimeField("alta", auto_now_add=True)

    class Meta:
        verbose_name = "suscripción push"
        verbose_name_plural = "suscripciones push"

    def __str__(self) -> str:
        return f"{self.user} · {self.user_agent[:40]}"
