"""Seed the three plans and the founder program row (values mirror plans.DEFAULT_PLANS)."""

from django.db import migrations

PLANS = [
    {
        "code": "basico",
        "name": "Básico",
        "max_lotes": 2,
        "max_alert_rules": 3,
        "allows_push": False,
        "priority_support": False,
        "highlighted": False,
        "order": 1,
    },
    {
        "code": "productor",
        "name": "Productor",
        "max_lotes": 15,
        "max_alert_rules": None,
        "allows_push": True,
        "priority_support": False,
        "highlighted": True,
        "order": 2,
    },
    {
        "code": "empresa",
        "name": "Empresa",
        "max_lotes": None,
        "max_alert_rules": None,
        "allows_push": True,
        "priority_support": True,
        "highlighted": False,
        "order": 3,
    },
]


def seed(apps, schema_editor):
    Plan = apps.get_model("accounts", "Plan")
    FounderProgram = apps.get_model("accounts", "FounderProgram")
    for fields in PLANS:
        Plan.objects.get_or_create(code=fields["code"], defaults=fields)
    FounderProgram.objects.get_or_create(pk=1)


def unseed(apps, schema_editor):
    apps.get_model("accounts", "Plan").objects.all().delete()
    apps.get_model("accounts", "FounderProgram").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_plans"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
