"""Alert evaluation (odd/tasks/cuenta-planes-alertas.md S6).

Runs after each forecast archive run. It only records AlertEvent rows; delivery by push and
email is a separate step. The (rule, target_date) unique constraint is the dedup, so running
it again creates nothing new.
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.accounts.plans import rule_ids_within_plan
from apps.archiver.cells import grid_cell
from apps.archiver.forecast import forecasts

from .evaluate import evaluate
from .models import AlertEvent, AlertRule

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
    stats = {"rules": len(rules), "cells": len(by_cell), "created": 0, "skipped_stale": 0}
    for cell, forecast in _fresh_or_none(forecasts(by_cell, now), by_cell, now, max_age):
        if forecast is None:
            stats["skipped_stale"] += 1
            continue
        for rule in by_cell[cell]:
            for trigger in evaluate(rule, forecast.payload, now):
                _, created = AlertEvent.objects.get_or_create(
                    rule=rule,
                    target_date=trigger.target_date,
                    defaults={
                        "user": rule.user,
                        "lote": rule.lote,
                        "title": trigger.title,
                        "body": trigger.body,
                        "data": {
                            "value": trigger.value,
                            "threshold": (
                                None if rule.threshold is None else float(rule.threshold)
                            ),
                            "comparator": rule.comparator,
                            "variable": rule.variable,
                            "at": trigger.at,
                        },
                    },
                )
                stats["created"] += created
    logger.info("Alert evaluation run: %s", stats)
    return stats


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
