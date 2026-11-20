from celery import shared_task

from . import price_changes, services


@shared_task(name="payments.end_cancelled_subscriptions")
def end_cancelled_subscriptions() -> int:
    return services.end_cancelled_subscriptions()


@shared_task(name="payments.send_price_notices")
def send_price_notices() -> int:
    """Right after a price change is scheduled (avisos-cambios S2)."""
    return price_changes.send_pending_notices()


@shared_task(name="payments.price_notices")
def price_notices() -> int:
    """Daily: late subscribers' notices and every unsent one (avisos-cambios S2)."""
    return price_changes.daily_notices()


@shared_task(name="payments.apply_price_changes")
def apply_price_changes() -> int:
    """Daily: scheduled prices whose date came, at Mercado Pago (avisos-cambios S3)."""
    return price_changes.apply_due()
