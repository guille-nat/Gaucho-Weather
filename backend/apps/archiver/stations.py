"""SMN reference stations of the initial zone (south of Santa Fe, núcleo zone).

Coordinates and WMO numbers come from the SMN station list
(https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=estaciones), converted from
degrees and minutes.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Station:
    wmo_id: str
    name: str  # exactly as it appears in the SMN datohorario file
    latitude: float
    longitude: float


STATIONS: tuple[Station, ...] = (
    Station("87480", "ROSARIO AERO", -32.9, -60.7667),
    Station("87468", "VENADO TUERTO AERO", -33.6667, -61.95),
    Station("87467", "MARCOS JUAREZ AERO", -32.6667, -62.15),
)

STATIONS_BY_NAME = {station.name: station for station in STATIONS}
