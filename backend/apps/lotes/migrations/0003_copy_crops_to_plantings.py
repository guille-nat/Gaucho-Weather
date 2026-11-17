from django.db import migrations


def lote_crops_to_plantings(apps, schema_editor):
    """Each lote with a crop gets one planting with it; the hectares stay unknown (S4).

    A lote with a sowing date but no crop (the old form allowed it) gets an "otro" planting
    with that date, so the date is not lost; the farmer renames it from the lote page (L5).
    """
    Lote = apps.get_model("lotes", "Lote")
    Planting = apps.get_model("lotes", "Planting")
    plantings = []
    for lote_id, crop, sowing_date in Lote.objects.order_by("id").values_list(
        "id", "crop", "sowing_date"
    ):
        if crop:
            plantings.append(Planting(lote_id=lote_id, crop=crop, sowing_date=sowing_date))
        elif sowing_date is not None:
            plantings.append(Planting(lote_id=lote_id, crop="otro", sowing_date=sowing_date))
    Planting.objects.bulk_create(plantings)


def first_planting_to_lote(apps, schema_editor):
    """The lote takes back its first planting's crop and sowing date; the rest is lost."""
    Lote = apps.get_model("lotes", "Lote")
    Planting = apps.get_model("lotes", "Planting")
    seen = set()
    for planting in Planting.objects.order_by("lote_id", "id"):
        if planting.lote_id in seen:
            continue
        seen.add(planting.lote_id)
        Lote.objects.filter(id=planting.lote_id).update(
            crop=planting.crop, sowing_date=planting.sowing_date
        )


class Migration(migrations.Migration):

    dependencies = [
        ("lotes", "0002_planting"),
    ]

    operations = [
        migrations.RunPython(lote_crops_to_plantings, first_planting_to_lote),
    ]
