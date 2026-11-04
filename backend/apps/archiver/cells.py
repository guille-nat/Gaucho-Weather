"""Grid cells: coordinates rounded to 0.1 degree (about 11 km)."""

from decimal import ROUND_HALF_UP, Decimal

Cell = tuple[Decimal, Decimal]

_STEP = Decimal("0.1")


def grid_cell(latitude, longitude) -> Cell:
    return (
        Decimal(str(latitude)).quantize(_STEP, rounding=ROUND_HALF_UP),
        Decimal(str(longitude)).quantize(_STEP, rounding=ROUND_HALF_UP),
    )


# Argentina bounds (Phase 1 S8), shared by lote validation and the public endpoints.
LATITUDE_MIN, LATITUDE_MAX = Decimal("-56"), Decimal("-21")
LONGITUDE_MIN, LONGITUDE_MAX = Decimal("-74"), Decimal("-53")


def in_argentina(latitude, longitude) -> bool:
    latitude, longitude = Decimal(str(latitude)), Decimal(str(longitude))
    return LATITUDE_MIN <= latitude <= LATITUDE_MAX and LONGITUDE_MIN <= longitude <= LONGITUDE_MAX
