"""Archiver tasks (S9). Both are idempotent and never raise on network errors:
they log, skip what failed, and the next scheduled run tries again."""

import logging
from datetime import timedelta

import httpx
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.lotes.models import Lote

from . import openmeteo
from .cells import Cell, grid_cell
from .models import ForecastSnapshot, Observation
from .smn import parse_datohorario
from .stations import STATIONS, STATIONS_BY_NAME

logger = logging.getLogger(__name__)

HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def forecast_cells() -> list[Cell]:
    cells = {grid_cell(s.latitude, s.longitude) for s in STATIONS}
    for latitude, longitude in Lote.objects.values_list("latitude", "longitude"):
        cells.add(grid_cell(latitude, longitude))
    return sorted(cells)


@shared_task(name="archiver.fetch_forecasts")
def fetch_forecasts() -> dict[str, int]:
    now = timezone.now()
    fetch_hour = now.replace(minute=0, second=0, microsecond=0)
    stats = {"stored": 0, "skipped": 0, "failed": 0}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        for cell in forecast_cells():
            for kind, model in openmeteo.JOBS:
                key = {
                    "cell_lat": cell[0],
                    "cell_lon": cell[1],
                    "model": model,
                    "kind": kind,
                    "fetch_hour": fetch_hour,
                }
                if ForecastSnapshot.objects.filter(**key).exists():
                    stats["skipped"] += 1
                    continue
                try:
                    payload = openmeteo.fetch(client, kind, model, cell)
                except (httpx.HTTPError, ValueError) as exc:
                    stats["failed"] += 1
                    logger.warning("Open-Meteo %s %s %s failed: %s", kind, model, cell, exc)
                    continue
                _, created = ForecastSnapshot.objects.get_or_create(
                    **key, defaults={"payload": payload, "fetched_at": now}
                )
                stats["stored" if created else "skipped"] += 1
    logger.info("Forecast archive run: %s", stats)
    return stats


@shared_task(name="archiver.fetch_smn_observations")
def fetch_smn_observations() -> dict[str, int]:
    """Download the last SMN_LOOKBACK_DAYS daily files (yesterday first).

    Re-reading a few past days lets a failed day recover on the next run;
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
