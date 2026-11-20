from django.db import migrations, models


class Migration(migrations.Migration):
    """avisos-cambios L8: a scheduled change carries the dollar price too.

    The one-off default only fills rows that already exist. Scheduled changes were never
    released (the feature is on its branch), so no table has any; it is never kept.
    """

    dependencies = [
        ("payments", "0003_price_changes"),
    ]

    operations = [
        migrations.AddField(
            model_name="pricechange",
            name="price_usd_month",
            field=models.PositiveIntegerField(default=1, verbose_name="precio nuevo por mes (USD)"),
            preserve_default=False,
        ),
    ]
