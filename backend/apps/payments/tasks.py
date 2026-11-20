from celery import shared_task

from . import services


@shared_task(name="payments.end_cancelled_subscriptions")
def end_cancelled_subscriptions() -> int:
    return services.end_cancelled_subscriptions()
