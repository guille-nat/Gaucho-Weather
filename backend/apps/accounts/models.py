from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def get_by_natural_key(self, username):
        return self.get(email__iexact=username)

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("The email is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields["is_staff"] = True
        extra_fields["is_superuser"] = True
        return self._create_user(email, password, **extra_fields)


class Plan(models.Model):
    """A subscription tier. Limits, price and flags are edited in the admin."""

    BASICO = "basico"
    PRODUCTOR = "productor"
    EMPRESA = "empresa"

    code = models.SlugField("código", max_length=20, unique=True)
    name = models.CharField("nombre", max_length=50)
    price_ars_month = models.PositiveIntegerField(
        "precio mensual (ARS)", null=True, blank=True, help_text="Vacío = «Precio a confirmar»."
    )
    # A fixed dollar price, not a conversion: both prices are updated every three months
    # (precios-productor S5).
    price_usd_month = models.PositiveIntegerField(
        "precio mensual (USD)", null=True, blank=True, help_text="Vacío = «Precio a confirmar»."
    )
    max_lotes = models.PositiveIntegerField(
        "máximo de lotes", null=True, blank=True, help_text="Vacío = sin límite."
    )
    max_alert_rules = models.PositiveIntegerField(
        "máximo de reglas de alerta", null=True, blank=True, help_text="Vacío = sin límite."
    )
    allows_push = models.BooleanField("notificaciones push", default=False)
    priority_support = models.BooleanField("soporte prioritario", default=False)
    highlighted = models.BooleanField("destacado", default=False)
    order = models.PositiveSmallIntegerField("orden", default=0)

    class Meta:
        verbose_name = "plan"
        verbose_name_plural = "planes"
        ordering = ["order"]

    def __str__(self) -> str:
        return self.name


class FounderProgram(models.Model):
    """Single row: how many founder slots exist and the next number to hand out."""

    limit = models.PositiveIntegerField("cupo de founders", default=100)
    next_number = models.PositiveIntegerField("próximo número", default=1)
    trial_days = models.PositiveIntegerField("días de prueba de Productor", default=30)

    class Meta:
        verbose_name = "programa founders"
        verbose_name_plural = "programa founders"

    def __str__(self) -> str:
        return f"Founders: {self.next_number - 1} de {self.limit}"

    @property
    def remaining(self) -> int:
        return max(self.limit - (self.next_number - 1), 0)


class User(AbstractBaseUser, PermissionsMixin):
    """Account identified by email; there is no username."""

    email = models.EmailField("email", unique=True)
    name = models.CharField("nombre", max_length=150)
    is_active = models.BooleanField("activo", default=True)
    is_staff = models.BooleanField("staff", default=False)
    date_joined = models.DateTimeField("alta", default=timezone.now)
    plan = models.ForeignKey(
        Plan,
        to_field="code",
        on_delete=models.PROTECT,
        default=Plan.BASICO,
        related_name="users",
        verbose_name="plan",
    )
    plan_expires_at = models.DateTimeField(
        "vence el plan", null=True, blank=True, help_text="Vacío = no vence (founders y pagos)."
    )
    founder_number = models.PositiveIntegerField("founder n.º", null=True, blank=True, unique=True)
    notify_push = models.BooleanField("avisos push", default=True)
    notify_email = models.BooleanField("avisos por email", default=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def __str__(self) -> str:
        return self.email

    @property
    def is_founder(self) -> bool:
        return self.founder_number is not None


class PlanChange(models.Model):
    """One move between plans, newest first: the history the subscription page shows (S14)."""

    class Reason(models.TextChoices):
        FOUNDER = "founder", "alta como founder"
        TRIAL = "trial", "alta con prueba de Productor"
        TRIAL_ENDED = "trial_ended", "fin de la prueba"
        REQUEST = "request", "pedido del usuario"
        STAFF = "staff", "cambio de staff"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="plan_changes", verbose_name="usuario"
    )
    from_plan = models.ForeignKey(
        Plan,
        to_field="code",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="plan anterior",
        help_text="Vacío = alta de la cuenta.",
    )
    to_plan = models.ForeignKey(
        Plan, to_field="code", on_delete=models.PROTECT, related_name="+", verbose_name="plan nuevo"
    )
    reason = models.CharField("motivo", max_length=20, choices=Reason.choices)
    at = models.DateTimeField("fecha", default=timezone.now)
    by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="hecho por",
    )
    note = models.CharField("nota", max_length=200, blank=True)

    class Meta:
        verbose_name = "cambio de plan"
        verbose_name_plural = "historial de planes"
        ordering = ["-at", "-id"]

    def __str__(self) -> str:
        return f"{self.user} → {self.to_plan_id} ({self.reason})"


class PlanRequest(models.Model):
    """A user's ask for another plan or to cancel down to Básico; staff apply it (S14)."""

    class Kind(models.TextChoices):
        CHANGE = "change", "cambio de plan"
        CANCEL = "cancel", "baja a Básico"

    class Status(models.TextChoices):
        PENDING = "pending", "pendiente"
        APPLIED = "applied", "aplicado"
        REJECTED = "rejected", "rechazado"
        WITHDRAWN = "withdrawn", "retirado"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="plan_requests", verbose_name="usuario"
    )
    kind = models.CharField("tipo", max_length=10, choices=Kind.choices)
    plan = models.ForeignKey(
        Plan,
        to_field="code",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="plan pedido",
    )
    status = models.CharField(
        "estado", max_length=10, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField("pedido el", default=timezone.now)
    resolved_at = models.DateTimeField("resuelto el", null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name="resuelto por",
    )

    class Meta:
        verbose_name = "pedido de plan"
        verbose_name_plural = "pedidos de plan"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="pending"),
                name="one_pending_plan_request_per_user",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user}: {self.get_kind_display()} ({self.get_status_display()})"
