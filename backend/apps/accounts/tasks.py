from celery import shared_task

from . import plans


@shared_task(name="accounts.expire_trials")
def expire_trials() -> int:
    return plans.expire_trials()
