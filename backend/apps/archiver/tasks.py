"""Archiver tasks (S9, S12). All are idempotent and never raise on network errors:
they log, skip what failed, and the next scheduled run tries again."""

import logging
from datetime import timedelta
from decimal import Decimal

import httpx
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from kombu.exceptions import OperationalError

from apps.alerts.tasks import evaluate_rules
from apps.lotes.models import Lote

from . import history, openmeteo
from .cells import Cell, grid_cell
from .models import ForecastSnapshot, Observation, WeatherHour
from .smn import parse_datohorario
from .stations import STATIONS, STATIONS_BY_NAME

logger = logging.getLogger(__name__)

HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
# The models publish a new run every 6 hours; the archive keeps one snapshot per slot.
FORECAST_SLOT_HOURS = 6


def forecast_cells() -> list[Cell]:
    cells = {grid_cell(s.latitude, s.longitude) for s in STATIONS}
    for latitude, longitude in Lote.objects.values_list("latitude", "longitude"):
        cells.add(grid_cell(latitude, longitude))
    return sorted(cells)


def archive_cell(
    client: httpx.Client,
    cell: Cell,
    jobs=openmeteo.JOBS,
    now=None,
    stats: dict[str, int] | None = None,
    fresh_since=None,
) -> dict[str, int]:
    """Fetch and store each (kind, model) job of one cell, at most once per hour.

    The single idempotent archive path: the scheduled run and the public
    on-demand forecast both store through it. With `fresh_since`, a job that
    already has a snapshot fetched at or after it is skipped too.
    """
    now = now or timezone.now()
    fetch_hour = now.replace(minute=0, second=0, microsecond=0)
    stats = stats if stats is not None else {"stored": 0, "skipped": 0, "failed": 0}
    for kind, model in jobs:
        job = {"cell_lat": cell[0], "cell_lon": cell[1], "model": model, "kind": kind}
        key = {**job, "fetch_hour": fetch_hour}
        fresh = ForecastSnapshot.objects.filter(**key).exists()
        if not fresh and fresh_since is not None:
            fresh = ForecastSnapshot.objects.filter(**job, fetched_at__gte=fresh_since).exists()
        if fresh:
            stats["skipped"] += 1
            continue
        try:
            payload = openmeteo.fetch(client, kind, model, cell)
        except (httpx.HTTPError, ValueError) as exc:
            stats["failed"] += 1
            logger.warning(
                "Open-Meteo %s %s %s failed: %s", kind, model, cell, openmeteo.describe_error(exc)
            )
            continue
        _, created = ForecastSnapshot.objects.get_or_create(
            **key, defaults={"payload": payload, "fetched_at": now}
        )
        stats["stored" if created else "skipped"] += 1
    return stats


def forecast_slot_start(now):
    """Start of the 6-hour slot (00, 06, 12 or 18, local time) that `now` falls in."""
    local = timezone.localtime(now)
    return local.replace(
        hour=local.hour - local.hour % FORECAST_SLOT_HOURS, minute=0, second=0, microsecond=0
    )


@shared_task(name="archiver.fetch_forecasts")
def fetch_forecasts() -> dict[str, int]:
    """Hourly: fetch each cell's jobs that have no snapshot yet in the current 6-hour slot.

    So a slot is fetched once, at its first run, and a slot missed while the stack was down
    (or a job that failed) is caught up at the next hourly run instead of 6 hours later.
    """
    now = timezone.now()
    slot_start = forecast_slot_start(now)
    stats = {"stored": 0, "skipped": 0, "failed": 0}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for cell in forecast_cells():
            archive_cell(client, cell, openmeteo.JOBS, now, stats, fresh_since=slot_start)
    logger.info("Forecast archive run: %s", stats)
    if stats["stored"]:
        _queue_alert_evaluation()
    return stats


@shared_task(name="archiver.fetch_cell_forecast")
def fetch_cell_forecast(latitude: str, longitude: str) -> dict[str, int]:
    """S12: the forecast of a new or moved lote's cell now, not at the next 6-hourly run.

    A cell whose deterministic models were fetched less than FRESH_FOR ago (another lote or a
    public search) is skipped. Network errors are logged by `archive_cell`, never raised.
    """
    # Imported here: apps.weather.ondemand imports this module for archive_cell.
    from apps.alerts.models import AlertRule
    from apps.weather.ondemand import FRESH_FOR

    from .forecast import latest_archives

    now = timezone.now()
    cell = grid_cell(Decimal(latitude), Decimal(longitude))
    stats = {"stored": 0, "skipped": 0, "failed": 0, "fresh": 0}
    archive = latest_archives({cell}).get(cell)
    if archive is not None and now - archive.fetched_at < FRESH_FOR:
        stats["fresh"] = 1
        return stats
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        archive_cell(client, cell, openmeteo.JOBS, now, stats)
    logger.info("Forecast of cell %s: %s", cell, stats)
    # Only a moved lote can already have rules; a new one has none to evaluate yet.
    has_rules = AlertRule.objects.filter(
        enabled=True, lote__latitude=Decimal(latitude), lote__longitude=Decimal(longitude)
    ).exists()
    if stats["stored"] and has_rules:
        _queue_alert_evaluation()
    return stats


def _queue_alert_evaluation() -> None:
    """Evaluate the custom alerts on the fresh forecasts, in the worker.

    `delay` (not `send_task`) so eager mode runs it inline in tests without a broker. A broker
    outage must not fail the archive run: the next run queues it again.
    """
    try:
        evaluate_rules.delay()
    except OperationalError as exc:
        logger.warning("Could not queue the alert evaluation: %s", exc)


@shared_task(name="archiver.fetch_smn_observations")
def fetch_smn_observations() -> dict[str, int]:
    """Download the last SMN_LOOKBACK_DAYS daily files (yesterday first), every hour.

    Re-reading a few past days lets a failed run or day recover on the next one;
    the unique constraint keeps rows from duplicating.
    """
    today = timezone.localdate()
    stats = {"stored": 0, "failed_days": 0}
    with httpx.Client(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        for days_back in range(1, settings.SMN_LOOKBACK_DAYS + 1):
            day = today - timedelta(days=days_back)
            url = settings.SMN_DATOHORARIO_URL.format(date=day.strftime("%Y%m%d"))
            try:
                response = client.get(url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                stats["failed_days"] += 1
                logger.warning("SMN datohorario %s failed: %s", day, exc)
                continue
            stored = _store_observations(response.content.decode("latin-1"))
            if stored is None:
                stats["failed_days"] += 1
                # SMN answers 200 with "El archivo no existe." for missing files.
                logger.warning("SMN datohorario %s has no rows for the stations", day)
                continue
            stats["stored"] += stored
    logger.info("SMN archive run: %s", stats)
    return stats


def _store_observations(text: str) -> int | None:
    observations = [
        Observation(
            station_id=STATIONS_BY_NAME[row.station_name].wmo_id,
            station_name=row.station_name,
            observed_at=row.observed_at,
            temperature_c=row.temperature_c,
            humidity_pct=row.humidity_pct,
            pressure_hpa=row.pressure_hpa,
            wind_direction_deg=row.wind_direction_deg,
            wind_speed_kmh=row.wind_speed_kmh,
            raw_line=row.raw_line,
        )
        for row in parse_datohorario(text)
        if row.station_name in STATIONS_BY_NAME
    ]
    if not observations:
        return None
    before = Observation.objects.count()
    Observation.objects.bulk_create(observations, ignore_conflicts=True)
    return Observation.objects.count() - before


def lote_cells() -> list[Cell]:
    return sorted(
        {grid_cell(lat, lon) for lat, lon in Lote.objects.values_list("latitude", "longitude")}
    )


@shared_task(name="archiver.fetch_history")
def fetch_history() -> dict[str, int]:
    """Hourly (S2): every lote cell from its last stored hour through now, so it heals itself.

    An empty cell gets the full backfill; the 04:20 run also revises the last few days. A cell
    stops at its first failed chunk, so no hole is left behind its last stored hour.
    """
    now = timezone.localtime()
    today = now.date()
    revise = now.hour == history.REVISION_HOUR
    cells = lote_cells()
    stats = {"stored": 0, "failed": 0, "cells": len(cells)}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for cell in cells:
            start, end = history.catch_up_range(history.last_stored_hour(cell), today, revise)
            for first, last in history.chunks(start, end):
                try:
                    stats["stored"] += history.store_history(client, cell, first, last)
                except (httpx.HTTPError, ValueError) as exc:
                    stats["failed"] += 1
                    logger.warning(
                        "History %s from %s to %s failed: %s",
                        cell,
                        first,
                        last,
                        openmeteo.describe_error(exc),
                    )
                    break
    logger.info("History run: %s", stats)
    return stats


@shared_task(name="archiver.backfill_history")
def backfill_history(latitude: str, longitude: str) -> int:
    """The last BACKFILL_DAYS of one lote's cell, unless another lote already loaded them."""
    cell = grid_cell(Decimal(latitude), Decimal(longitude))
    start, end = history.backfill_range(timezone.localdate())
    oldest_needed = timezone.make_aware(
        timezone.datetime.combine(start + timedelta(days=1), timezone.datetime.min.time()),
        history.LOCAL,
    )
    loaded = WeatherHour.objects.filter(
        cell_lat=cell[0], cell_lon=cell[1], source=history.SOURCE, time__lte=oldest_needed
    ).exists()
    if loaded:
        return 0
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            return history.store_history(client, cell, start, end)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("History backfill %s failed: %s", cell, openmeteo.describe_error(exc))
        return 0
