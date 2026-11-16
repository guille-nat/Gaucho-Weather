"""Existing accounts become the first founders, oldest first; staff never take a slot.

Accounts beyond the founder limit start the Productor trial on the day this runs.
"""

from datetime import timedelta

from django.db import migrations
from django.utils import timezone


def backfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    FounderProgram = apps.get_model("accounts", "FounderProgram")
    program, _ = FounderProgram.objects.select_for_update().get_or_create(pk=1)
    now = timezone.now()
    pending = User.objects.filter(is_staff=False, founder_number__isnull=True, plan_id="basico")
    for user in pending.order_by("date_joined", "id"):
        user.plan_id = "productor"
        if program.next_number <= program.limit:
            user.founder_number = program.next_number
            user.plan_expires_at = None
            program.next_number += 1
        else:
            user.plan_expires_at = now + timedelta(days=program.trial_days)
        user.save(update_fields=["plan", "founder_number", "plan_expires_at"])
    program.save(update_fields=["next_number"])


def unbackfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.update(plan_id="basico", founder_number=None, plan_expires_at=None)
    apps.get_model("accounts", "FounderProgram").objects.update(next_number=1)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_user_plan_fields"),
    ]

    operations = [migrations.RunPython(backfill, unbackfill)]
