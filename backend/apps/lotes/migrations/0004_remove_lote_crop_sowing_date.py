from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("lotes", "0003_copy_crops_to_plantings"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="lote",
            name="crop",
        ),
        migrations.RemoveField(
            model_name="lote",
            name="sowing_date",
        ),
    ]
