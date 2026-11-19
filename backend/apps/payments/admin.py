from django.contrib import admin

from .models import Payment, ProviderSubscription


@admin.register(ProviderSubscription)
class ProviderSubscriptionAdmin(admin.ModelAdmin):
    list_display = ["user", "plan", "status", "amount", "currency", "next_payment_at", "created_at"]
    list_filter = ["status", "plan", "provider"]
    search_fields = ["user__email", "external_id"]
    raw_id_fields = ["user"]
    readonly_fields = ["external_id", "checkout_url", "created_at", "updated_at"]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["user", "amount", "currency", "status", "paid_at", "created_at"]
    list_filter = ["status", "provider"]
    search_fields = ["user__email", "external_id"]
    raw_id_fields = ["user", "subscription"]
    readonly_fields = ["external_id", "payload", "created_at"]
