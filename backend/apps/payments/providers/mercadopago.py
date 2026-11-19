"""Mercado Pago subscriptions over its REST API, with httpx (no SDK).

Official docs (mercadopago.com.ar/developers):
- subscriptions without an associated plan: POST /preapproval with status "pending" returns an
  `init_point` where the payer chooses how to pay; GET and PUT /preapproval/{id}
  (PUT {"status": "cancelled"} cancels it);
- GET /v1/payments/{id} and GET /authorized_payments/{id} (a subscription's charge);
- webhooks: the `x-signature` header carries `ts` and `v1`, an HMAC-SHA256 in hex of
  "id:{data.id};request-id:{x-request-id};ts:{ts};" with the application's webhook secret.
  A pair whose value is missing is left out of the manifest; an alphanumeric data.id goes
  lowercased.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal

import httpx
from django.conf import settings
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ParseError

from .base import (
    Checkout,
    InvalidSignature,
    PaymentProvider,
    ProviderError,
    RemotePayment,
    RemoteSubscription,
    WebhookEvent,
)

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(20.0, connect=10.0)

SUBSCRIPTION_STATUS = {
    "pending": "pending",
    "authorized": "authorized",
    "paused": "paused",
    "cancelled": "cancelled",
    "canceled": "cancelled",  # spelled both ways across the docs
}
PAYMENT_STATUS = {
    "approved": "approved",
    "pending": "pending",
    "in_process": "pending",
    "authorized": "pending",
    "in_mediation": "pending",
    "rejected": "rejected",
    "refunded": "refunded",
    "charged_back": "refunded",
    "cancelled": "cancelled",
}
WEBHOOK_TOPICS = {
    "subscription_preapproval": WebhookEvent.SUBSCRIPTION,
    "payment": WebhookEvent.PAYMENT,
    "subscription_authorized_payment": WebhookEvent.INVOICE,
}
# What a Payment keeps of Mercado Pago's answer: no payer, card or address data.
PAYLOAD_KEYS = (
    "id",
    "status",
    "status_detail",
    "transaction_amount",
    "currency_id",
    "date_created",
    "date_approved",
    "date_last_updated",
    "payment_method_id",
    "payment_type_id",
    "operation_type",
    "external_reference",
    "metadata",
)


class MercadoPago(PaymentProvider):
    name = "mercadopago"

    def is_configured(self) -> bool:
        return bool(settings.MERCADOPAGO_ACCESS_TOKEN and settings.MERCADOPAGO_WEBHOOK_SECRET)

    # --- REST API ---------------------------------------------------------------------------

    def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        headers = {"Authorization": f"Bearer {settings.MERCADOPAGO_ACCESS_TOKEN}"}
        try:
            with httpx.Client(
                base_url=settings.MERCADOPAGO_API_URL, headers=headers, timeout=TIMEOUT
            ) as client:
                response = client.request(method, path, json=json)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            # The body may carry the payer's data: log the status only.
            logger.warning("Mercado Pago %s %s answered %s", method, path, exc.response.status_code)
            raise ProviderError(f"Mercado Pago answered {exc.response.status_code}") from exc
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Mercado Pago %s %s failed: %s", method, path, type(exc).__name__)
            raise ProviderError("Mercado Pago could not be reached") from exc

    def start_subscription(
        self, *, payer_email, reason, amount, currency, reference, back_url
    ) -> Checkout:
        body = self._request(
            "POST",
            "/preapproval",
            json={
                "reason": reason,
                "external_reference": reference,
                "payer_email": payer_email,
                "auto_recurring": {
                    "frequency": 1,
                    "frequency_type": "months",
                    "transaction_amount": amount,
                    "currency_id": currency,
                },
                "back_url": back_url,
                "status": "pending",
            },
        )
        if not body.get("id") or not body.get("init_point"):
            raise ProviderError("Mercado Pago returned no checkout link")
        return Checkout(external_id=str(body["id"]), checkout_url=body["init_point"])

    def cancel_subscription(self, external_id: str) -> RemoteSubscription:
        body = self._request("PUT", f"/preapproval/{external_id}", json={"status": "cancelled"})
        return _subscription(body, external_id)

    def fetch_subscription(self, external_id: str) -> RemoteSubscription:
        return _subscription(self._request("GET", f"/preapproval/{external_id}"), external_id)

    def fetch_payment(self, external_id: str) -> RemotePayment:
        body = self._request("GET", f"/v1/payments/{external_id}")
        status = PAYMENT_STATUS.get(body.get("status"), "pending")
        metadata = body.get("metadata") or {}
        transaction = (body.get("point_of_interaction") or {}).get("transaction_data") or {}
        subscription_id = metadata.get("preapproval_id") or transaction.get("subscription_id")
        return RemotePayment(
            external_id=str(body.get("id") or external_id),
            status=status,
            amount=Decimal(str(body.get("transaction_amount") or 0)),
            currency=body.get("currency_id") or "ARS",
            paid_at=_datetime(body.get("date_approved")),
            subscription_external_id=str(subscription_id) if subscription_id else None,
            payload={key: body[key] for key in PAYLOAD_KEYS if key in body},
        )

    def fetch_invoice(self, external_id: str) -> tuple[str | None, str | None]:
        body = self._request("GET", f"/authorized_payments/{external_id}")
        payment_id = (body.get("payment") or {}).get("id")
        preapproval_id = body.get("preapproval_id")
        return (
            str(payment_id) if payment_id else None,
            str(preapproval_id) if preapproval_id else None,
        )

    # --- Webhook ----------------------------------------------------------------------------

    def verify_webhook(self, request) -> WebhookEvent | None:
        try:
            body = request.data if isinstance(request.data, dict) else {}
        except ParseError:
            body = {}  # the signature does not cover the body: the query string is enough
        data_id = request.query_params.get("data.id") or str(
            (body.get("data") or {}).get("id") or ""
        )
        parts = {}
        for part in request.headers.get("x-signature", "").split(","):
            key, _, value = part.partition("=")
            parts[key.strip()] = value.strip()
        ts, received = parts.get("ts"), parts.get("v1")
        if not ts or not received:
            raise InvalidSignature("missing x-signature")
        manifest = "".join(
            f"{key}:{value};"
            for key, value in (
                ("id", data_id.lower()),
                ("request-id", request.headers.get("x-request-id", "")),
                ("ts", ts),
            )
            if value
        )
        expected = hmac.new(
            settings.MERCADOPAGO_WEBHOOK_SECRET.encode(), manifest.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, received):
            raise InvalidSignature("x-signature does not match")
        topic = request.query_params.get("type") or request.query_params.get("topic")
        kind = WEBHOOK_TOPICS.get(topic or body.get("type"))
        if kind is None or not data_id:
            return None
        return WebhookEvent(kind=kind, resource_id=data_id)


def _subscription(body: dict, external_id: str) -> RemoteSubscription:
    return RemoteSubscription(
        external_id=str(body.get("id") or external_id),
        status=SUBSCRIPTION_STATUS.get(body.get("status"), "pending"),
        next_payment_at=_datetime(body.get("next_payment_date")),
    )


def _datetime(value):
    return parse_datetime(value) if value else None
