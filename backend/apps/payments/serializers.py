from rest_framework import serializers

from apps.accounts.terms import AcceptTermsField

from .models import Payment, ProviderSubscription


class SubscribeSerializer(serializers.Serializer):
    plan = serializers.CharField(max_length=20)
    currency = serializers.ChoiceField(choices=["ARS", "USD"], default="ARS")
    # The page shows the terms and the summary before Mercado Pago (promociones S0b, S0d).
    acepta_terminos = AcceptTermsField()


class ProviderSubscriptionSerializer(serializers.ModelSerializer):
    plan = serializers.CharField(source="plan_id", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    ends_at = serializers.SerializerMethodField()

    class Meta:
        model = ProviderSubscription
        fields = [
            "id",
            "plan",
            "plan_name",
            "provider",
            "currency",
            "amount",
            "status",
            "next_payment_at",
            "ends_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_ends_at(self, sub: ProviderSubscription):
        """When a cancelled or paused subscription stops giving the plan: the end of its paid
        month."""
        stopped = (ProviderSubscription.Status.CANCELLED, ProviderSubscription.Status.PAUSED)
        if sub.status not in stopped or sub.ended_at is not None:
            return None
        return serializers.DateTimeField().to_representation(sub.next_payment_at)


class PaymentSerializer(serializers.ModelSerializer):
    """No payload: what the provider returned stays on the server."""

    class Meta:
        model = Payment
        fields = ["id", "amount", "currency", "status", "paid_at", "created_at"]
        read_only_fields = fields
