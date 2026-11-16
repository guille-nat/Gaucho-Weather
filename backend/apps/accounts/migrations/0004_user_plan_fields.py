import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_seed_plans"),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='founder_number',
            field=models.PositiveIntegerField(blank=True, null=True, unique=True, verbose_name='founder n.º'),
        ),
        migrations.AddField(
            model_name='user',
            name='notify_email',
            field=models.BooleanField(default=True, verbose_name='avisos por email'),
        ),
        migrations.AddField(
            model_name='user',
            name='notify_push',
            field=models.BooleanField(default=True, verbose_name='avisos push'),
        ),
        migrations.AddField(
            model_name='user',
            name='plan_expires_at',
            field=models.DateTimeField(blank=True, help_text='Vacío = no vence (founders y pagos).', null=True, verbose_name='vence el plan'),
        ),
        migrations.AddField(
            model_name='user',
            name='plan',
            field=models.ForeignKey(default='basico', on_delete=django.db.models.deletion.PROTECT, related_name='users', to='accounts.plan', to_field='code', verbose_name='plan'),
        ),
    ]
