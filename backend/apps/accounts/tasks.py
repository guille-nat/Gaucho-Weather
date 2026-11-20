from celery import shared_task

from . import password_reset, plans, terms


@shared_task(name="accounts.expire_trials")
def expire_trials() -> int:
    return plans.expire_trials()


@shared_task(
    name="accounts.send_password_reset",
    autoretry_for=(OSError,),
    retry_backoff=True,
    max_retries=3,
)
def send_password_reset(email: str) -> bool:
    return password_reset.send_reset_email(email)


@shared_task(name="accounts.terms_notices")
def terms_notices() -> int:
    """Daily: the email about a terms version before its date (avisos-cambios S5)."""
    return terms.send_notices()
