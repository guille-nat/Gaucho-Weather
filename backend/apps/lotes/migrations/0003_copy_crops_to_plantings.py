from django.db import migrations


def lote_crops_to_plantings(apps, schema_editor):
    """Each lote with a crop gets one planting with it; the hectares stay unknown (S4)."""
    Lote = apps.get_model("lotes", "Lote")
    Planting = apps.get_model("lotes", "Planting")
    Planting.objects.bulk_create(
        Planting(lote_id=lote_id, crop=crop, sowing_date=sowing_date)
        for lote_id, crop, sowing_date in Lote.objects.exclude(crop__isnull=True)
        .exclude(crop="")
        .order_by("id")
        .values_list("id", "crop", "sowing_date")
    )


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
