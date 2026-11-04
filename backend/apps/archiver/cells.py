"""Grid cells: coordinates rounded to 0.1 degree (about 11 km)."""

from decimal import ROUND_HALF_UP, Decimal

Cell = tuple[Decimal, Decimal]

_STEP = Decimal("0.1")


def grid_cell(latitude, longitude) -> Cell:
    return (
        Decimal(str(latitude)).quantize(_STEP, rounding=ROUND_HALF_UP),
        Decimal(str(longitude)).quantize(_STEP, rounding=ROUND_HALF_UP),
    )
