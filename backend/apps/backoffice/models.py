from django.conf import settings
from django.db import models
from django.utils import timezone


class BackofficeAction(models.Model):
    """One write made from the backoffice: who did what to whom, and with which values (S4).

    Super admins can change plans and prices for everyone, so each write leaves a row that
    nobody edits afterwards.
    """

    class Action(models.TextChoices):
        PLAN_CHANGE = "plan_change", "cambio de plan"
        REQUEST_APPLY = "request_apply", "pedido aplicado"
        REQUEST_REJECT = "request_reject", "pedido rechazado"
        PRICE_UPDATE = "price_update", "precio actualizado"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="+",
        verbose_name="hecho por",
    )
    action = models.CharField("acción", max_length=20, choices=Action.choices)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="cuenta",
    )
    payload = models.JSONField("datos", default=dict, blank=True)
    at = models.DateTimeField("fecha", default=timezone.now)

    class Meta:
        verbose_name = "acción del backoffice"
        verbose_name_plural = "registro del backoffice"
        ordering = ["-at", "-id"]

    def __str__(self) -> str:
        return f"{self.actor} · {self.get_action_display()}"

    @classmethod
    def record(cls, actor, action: str, target_user=None, **payload) -> "BackofficeAction":
        return cls.objects.create(
            actor=actor, action=action, target_user=target_user, payload=payload
        )
