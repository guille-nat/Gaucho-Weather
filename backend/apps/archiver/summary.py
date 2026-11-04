"""Tonight's minimum 2 m temperature per grid cell, read from the archive.

A plain forecast value for the lote card (S8), never a decision.
"""

from datetime import datetime, time, timedelta
from typing import TypedDict

from django.db.models import Q
from django.utils import timezone

from .cells import Cell
from .models import ForecastSnapshot
from .openmeteo import DETERMINISTIC_MODELS

NIGHT_START = time(20, 0)
NIGHT_END = time(8, 0)


class Summary(TypedDict):
    tonight_min_c_2m: float | None
    tonight_min_models: dict[str, float | None]
    fetched_at: datetime


def tonight_window(now_local: datetime) -> tuple[datetime, datetime]:
    """20:00 to 08:00 local. Before 08:00, "tonight" is the night in progress."""
    day = now_local.date()
    if now_local.time() < NIGHT_END:
        day -= timedelta(days=1)
    return datetime.combine(day, NIGHT_START), datetime.combine(day + timedelta(days=1), NIGHT_END)


def _night_min(times: list[str], temperatures: list, start: datetime, end: datetime):
    values = [
        value
        for stamp, value in zip(times or [], temperatures or [], strict=False)
        if value is not None and start <= datetime.fromisoformat(stamp) <= end
    ]
    return round(min(values), 1) if values else None


def tonight_summaries(cells: set[Cell], now: datetime | None = None) -> dict[Cell, Summary]:
    if not cells:
        return {}
    start, end = tonight_window(timezone.localtime(now or timezone.now()).replace(tzinfo=None))
    cell_filter = Q()
    for lat, lon in cells:
        cell_filter |= Q(cell_lat=lat, cell_lon=lon)
    latest = (
        ForecastSnapshot.objects.filter(
            cell_filter,
            kind=ForecastSnapshot.Kind.DETERMINISTIC,
            model__in=DETERMINISTIC_MODELS,
        )
        .order_by("cell_lat", "cell_lon", "model", "-fetched_at")
        .distinct("cell_lat", "cell_lon", "model")
        .values(
            "cell_lat",
            "cell_lon",
            "model",
            "fetched_at",
            "payload__hourly__time",
            "payload__hourly__temperature_2m",
        )
    )
    summaries: dict[Cell, Summary] = {}
    for row in latest:
        cell = (row["cell_lat"], row["cell_lon"])
        summary = summaries.setdefault(
            cell,
            {"tonight_min_c_2m": None, "tonight_min_models": {}, "fetched_at": row["fetched_at"]},
        )
        summary["tonight_min_models"][row["model"]] = _night_min(
            row["payload__hourly__time"], row["payload__hourly__temperature_2m"], start, end
        )
        summary["fetched_at"] = max(summary["fetched_at"], row["fetched_at"])
    for summary in summaries.values():
        values = [v for v in summary["tonight_min_models"].values() if v is not None]
        summary["tonight_min_c_2m"] = min(values) if values else None
    return summaries
