import django.core.validators
import django.db.models.deletion
from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lotes", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Planting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("crop", models.CharField(choices=[("soja", "Soja"), ("maiz", "Maíz"), ("trigo", "Trigo"), ("girasol", "Girasol"), ("cebada", "Cebada"), ("sorgo", "Sorgo"), ("otro", "Otro")], max_length=10, verbose_name="cultivo")),
                ("area_ha", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))], verbose_name="superficie (ha)")),
                ("sowing_date", models.DateField(blank=True, null=True, verbose_name="fecha de siembra")),
                ("lote", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plantings", to="lotes.lote")),
            ],
            options={
                "verbose_name": "cultivo del lote",
                "verbose_name_plural": "cultivos del lote",
                "ordering": ["id"],
            },
        ),
    ]
