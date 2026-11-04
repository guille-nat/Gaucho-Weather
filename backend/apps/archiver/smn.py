"""Parser for the SMN hourly observations file (datohorario<YYYYMMDD>.txt).

The file is fixed-width, Latin-1 and CRLF. Times are Argentine official time.
Example row (columns: FECHA HORA TEMP HUM PNM DD FF NOMBRE):

    02112026     0  20.1   88  1011.2   80   19     AEROPARQUE AERO

Empty columns mean "not reported". Station names longer than the column wrap
onto a second line; those continuation lines are skipped.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

ARGENTINA = ZoneInfo("America/Argentina/Buenos_Aires")

_ROW = re.compile(r"^\d{8}\s")
_DATE, _HOUR = slice(0, 8), slice(8, 14)
_TEMP, _HUM, _PNM = slice(14, 20), slice(20, 26), slice(26, 33)
_DD, _FF, _NAME = slice(33, 39), slice(39, 45), slice(45, None)


@dataclass(frozen=True)
class SmnRow:
    station_name: str
    observed_at: datetime
    temperature_c: Decimal | None
    humidity_pct: int | None
    pressure_hpa: Decimal | None
    wind_direction_deg: int | None
    wind_speed_kmh: Decimal | None
    raw_line: str


def _decimal(text: str) -> Decimal | None:
    text = text.strip()
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _int(text: str) -> int | None:
    value = _decimal(text)
    return int(value) if value is not None else None


def parse_datohorario(text: str) -> list[SmnRow]:
    rows = []
    for line in text.splitlines():
        line = line.rstrip("\r")
        if not _ROW.match(line):
            continue
        try:
            day = datetime.strptime(line[_DATE], "%d%m%Y")
            observed_at = day.replace(hour=int(line[_HOUR]), tzinfo=ARGENTINA)
        except ValueError:
            continue
        rows.append(
            SmnRow(
                station_name=line[_NAME].strip(),
                observed_at=observed_at,
                temperature_c=_decimal(line[_TEMP]),
                humidity_pct=_int(line[_HUM]),
                pressure_hpa=_decimal(line[_PNM]),
                wind_direction_deg=_int(line[_DD]),
                wind_speed_kmh=_decimal(line[_FF]),
                raw_line=line.rstrip(),
            )
        )
    return rows
