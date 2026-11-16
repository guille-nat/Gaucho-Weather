from django.core.management.base import BaseCommand

from apps.alerts.tasks import run_evaluation


class Command(BaseCommand):
    help = "Evaluate the custom alert rules on the archived forecasts now (no broker needed)."

    def handle(self, *args, **options):
        self.stdout.write(str(run_evaluation()))
