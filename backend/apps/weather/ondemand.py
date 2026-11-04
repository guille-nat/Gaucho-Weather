"""Forecast of any point in Argentina (S10): from the archive, or fetched on demand.

A cell whose latest deterministic snapshot is younger than FRESH_FOR is served
from the archive. Otherwise the deterministic models are fetched now and stored
through the archiver's idempotent path, so searches also feed the backtesting.
Ensembles stay with the scheduled run: they are ~50x larger, slower, and need
Open-Meteo's Professional plan for commercial use; an on-demand cell without
archived ensembles has null probabilities.
"""

import time
from datetime import datetime, timedelta

import httpx
from django.core.cache import cache
from django.utils import timezone

from apps.archiver import openmeteo
from apps.archiver.cells import Cell, grid_cell
from apps.archiver.forecast import CellArchive, Forecast, build_forecast, latest_archives
from apps.archiver.tasks import archive_cell

FRESH_FOR = timedelta(hours=3)
# Below gunicorn's 30 s worker timeout even when the three requests are slow.
HTTP_TIMEOUT = httpx.Timeout(8.0, connect=4.0)
LOCK_TTL_SECONDS = 60  # a crashed request cannot block the cell for longer
LOCK_WAIT_SECONDS = 20
LOCK_POLL_SECONDS = 0.25


class ForecastUnavailable(Exception):
    """Nothing archived for the cell and Open-Meteo could not be reached."""


def fetch_lock_key(cell: Cell) -> str:
    return f"forecast-fetch:{cell[0]}:{cell[1]}"


def _archive(cell: Cell) -> CellArchive | None:
    return latest_archives({cell}).get(cell)


def _refresh(cell: Cell, now: datetime) -> None:
    """Fetch the cell once even if several requests ask for it at the same time."""
    key = fetch_lock_key(cell)
    if cache.add(key, "fetching", LOCK_TTL_SECONDS):
        try:
            with httpx.Client(timeout=HTTP_TIMEOUT) as client:
                archive_cell(client, cell, openmeteo.DETERMINISTIC_JOBS, now)
        finally:
            cache.delete(key)
        return
    # Another request is fetching this cell: wait for it instead of fetching again.
    deadline = time.monotonic() + LOCK_WAIT_SECONDS
    while cache.get(key) is not None and time.monotonic() < deadline:
        time.sleep(LOCK_POLL_SECONDS)


def forecast_for(latitude, longitude, now: datetime | None = None) -> Forecast:
    """The S5 forecast of the point's cell. Raises ForecastUnavailable."""
    now = now or timezone.now()
    cell = grid_cell(latitude, longitude)
    archive = _archive(cell)
    if archive is None or now - archive.fetched_at >= FRESH_FOR:
        _refresh(cell, now)
        # On a network failure this is still the older snapshot, if there is one.
        archive = _archive(cell)
    if archive is None:
        raise ForecastUnavailable
    return build_forecast(archive, now)
