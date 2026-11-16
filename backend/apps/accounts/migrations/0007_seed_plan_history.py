"""Start the plan history (S14) of existing accounts with what is known for sure.

A founder joined as founder and a user with an expiry joined with the Productor trial, both at
`date_joined`. Anyone else (Básico after a trial, staff, a plan set by staff) gets no row: the
date and cause of their last change were never stored, and a made-up entry would be false. The
subscription page still shows their current plan. Seeded rows carry SEED_NOTE so the reverse
removes only them; accounts that already have history are left alone.
"""

from django.db import migrations

SEED_NOTE = "Reconstruido al crear el historial de planes."


def seed(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    PlanChange = apps.get_model("accounts", "PlanChange")
    without_history = User.objects.filter(plan_changes__isnull=True)
    rows = []
    for user in without_history.order_by("date_joined", "id"):
        if user.founder_number is not None:
            reason = "founder"
        elif user.plan_expires_at is not None and user.plan_id == "productor":
            reason = "trial"
        else:
            continue
        rows.append(
            PlanChange(
                user=user,
                from_plan_id=None,
                to_plan_id="productor",
                reason=reason,
                at=user.date_joined,
                note=SEED_NOTE,
            )
        )
    PlanChange.objects.bulk_create(rows)


def unseed(apps, schema_editor):
    apps.get_model("accounts", "PlanChange").objects.filter(note=SEED_NOTE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_plan_history_and_requests"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
