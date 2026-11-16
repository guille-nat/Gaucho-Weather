"""Alert evaluation (odd/tasks/cuenta-planes-alertas.md S6).

Runs after each forecast archive run. It records AlertEvent rows first; each new one is then
queued for delivery by push and email (S7) once the row is committed. The (rule, target_date)
unique constraint is the dedup, so running it again creates and sends nothing new.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from functools import partial

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from kombu.exceptions import OperationalError

from apps.accounts.plans import rule_ids_within_plan
from apps.archiver.cells import grid_cell
from apps.archiver.forecast import forecasts

from . import delivery
from .evaluate import evaluate
from .models import AlertEvent, AlertRule, DeliveryStatus

logger = logging.getLogger(__name__)


def active_rules() -> list[AlertRule]:
    """Enabled rules the owner's plan covers (rules beyond the cap stay paused)."""
    enabled = list(AlertRule.objects.filter(enabled=True).select_related("lote", "user__plan"))
    within: dict[int, set[int]] = {}
    for rule in enabled:
        if rule.user_id not in within:
            within[rule.user_id] = rule_ids_within_plan(rule.user)
    return [rule for rule in enabled if rule.pk in within[rule.user_id]]


def run_evaluation(now: datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    by_cell = defaultdict(list)
    rules = active_rules()
    for rule in rules:
        by_cell[grid_cell(rule.lote.latitude, rule.lote.longitude)].append(rule)

    max_age = timedelta(hours=settings.ALERTS_MAX_FORECAST_AGE_HOURS)
    stats = {
        "rules": len(rules),
        "cells": len(by_cell),
        "created": 0,
        "skipped_stale": 0,
        "errors": 0,
        "redispatched": _redispatch_stuck(now),
    }
    for cell, forecast in _fresh_or_none(forecasts(by_cell, now), by_cell, now, max_age):
        if forecast is None:
            stats["skipped_stale"] += 1
            continue
        try:
            # One cell's bad payload must not stop every other cell's alerts.
            with transaction.atomic():
                stats["created"] += _evaluate_cell(by_cell[cell], forecast, now)
        except Exception:
            stats["errors"] += 1
            logger.exception("Alert evaluation failed for cell %s", cell)
    logger.info("Alert evaluation run: %s", stats)
    return stats


# An event whose delivery could not be queued (broker down) is sent by a later run. Younger
# than this it may still be in flight; older, the alert is no longer useful.
REDISPATCH_AFTER = timedelta(minutes=10)
REDISPATCH_UNTIL = timedelta(hours=24)


def _redispatch_stuck(now) -> int:
    pending = Q(push_status=DeliveryStatus.PENDING) | Q(email_status=DeliveryStatus.PENDING)
    stuck = AlertEvent.objects.filter(
        pending,
        created_at__lte=now - REDISPATCH_AFTER,
        created_at__gte=now - REDISPATCH_UNTIL,
    ).values_list("pk", flat=True)
    count = 0
    for pk in stuck:
        transaction.on_commit(partial(_queue_delivery, pk))
        count += 1
    return count


def _evaluate_cell(rules, forecast, now) -> int:
    created_count = 0
    for rule in rules:
        for trigger in evaluate(rule, forecast.payload, now):
            event, created = AlertEvent.objects.get_or_create(
                rule=rule,
                target_date=trigger.target_date,
                defaults={
                    "user": rule.user,
                    "lote": rule.lote,
                    "title": trigger.title,
                    "body": trigger.body,
                    "data": {
                        "value": trigger.value,
                        "threshold": (None if rule.threshold is None else float(rule.threshold)),
                        "comparator": rule.comparator,
                        "variable": rule.variable,
                        "at": trigger.at,
                    },
                },
            )
            created_count += created
            if created:
                transaction.on_commit(partial(_queue_delivery, event.pk))
    return created_count


def _fresh_or_none(by_forecast, cells, now, max_age):
    """Each cell with its forecast, or None when it is missing or older than max_age."""
    for cell in cells:
        forecast = by_forecast.get(cell)
        if forecast is not None:
            fetched_at = datetime.fromisoformat(forecast.payload["fetched_at"])
            if now - fetched_at > max_age:
                forecast = None
        yield cell, forecast


@shared_task(name="alerts.evaluate_rules")
def evaluate_rules() -> dict[str, int]:
    return run_evaluation()


def _queue_delivery(event_id: int) -> None:
    """A broker outage must not fail the evaluation: the event stays pending in the inbox."""
    try:
        deliver_event.delay(event_id)
    except OperationalError as exc:
        logger.warning("Could not queue the delivery of alert %s: %s", event_id, exc)


@shared_task(bind=True, name="alerts.deliver_event", max_retries=delivery.MAX_RETRIES)
def deliver_event(self, event_id: int) -> dict[str, str]:
    """Send the event's pending channels; transient failures retry with backoff."""
    final = self.request.retries >= self.max_retries
    try:
        return delivery.deliver(event_id, final=final)
    except delivery.RetryLater as exc:
        raise self.retry(exc=exc, countdown=delivery.retry_countdown(self.request.retries)) from exc
