"""Send one recorded AlertEvent by Web Push and email (odd/tasks/cuenta-planes-alertas.md S7).

Record first, then send: the event row already exists (it is the inbox entry), and each
channel keeps its own status:

    pending ──claim──> sending ──> sent | skipped | failed
                          └──transient failure──> pending (attempts + 1, retried later)

Only the worker whose UPDATE moved a channel from pending to sending sends it, so a second
delivery of the same event never sends a channel twice. A channel left in `sending` by a
crashed worker stays there: losing one notice beats sending it twice.
"""

from __future__ import annotations

import json
import logging

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import F
from pywebpush import WebPushException, webpush

from .models import AlertEvent, DeliveryStatus, PushSubscription

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
PUSH_TTL_SECONDS = 12 * 60 * 60  # a notice older than this is not worth showing
PUSH_TIMEOUT_SECONDS = 10
GONE_STATUSES = {404, 410}  # the browser dropped the subscription: delete it, not an error
# The subscription itself is unusable (bad keys, refused payload): drop it, never retry it.
# None is what pywebpush raises with for malformed keys, before any push service answers.
BROKEN_STATUSES = {None, 400, 413}
# The push service refused our VAPID credentials: a configuration problem, not this browser's.
REJECTED_STATUSES = {401, 403}

EMAIL_BODY = "{body}\n\nMirá todas tus alertas en {url}/alertas\n\nGaucho Weather"


class RetryLater(Exception):
    """At least one channel hit a transient failure and went back to pending."""


class TransientFailure(Exception):
    pass


def retry_countdown(retries: int) -> int:
    """Seconds before retry number `retries + 1`: 1, 4 and 16 minutes."""
    return 60 * 4**retries


def deliver(event_id: int, *, final: bool = False) -> dict[str, str]:
    """Send every pending channel of the event once.

    A transient failure puts the channel back to pending and raises RetryLater after the
    other channel had its turn; on the `final` attempt it ends `failed` instead.
    """
    event = AlertEvent.objects.select_related("user__plan").filter(pk=event_id).first()
    if event is None:
        return {}
    outcome, transient = {}, False
    for field, send in (("push_status", _send_push), ("email_status", _send_email)):
        if not _claim(event_id, field):
            continue
        try:
            status = send(event)
        except TransientFailure as exc:
            logger.warning("Alert %s: %s failed: %s", event_id, field, exc)
            transient = True
            status = DeliveryStatus.FAILED if final else DeliveryStatus.PENDING
        except Exception:  # a bug must not leave the channel in "sending" forever
            logger.exception("Alert %s: %s failed unexpectedly", event_id, field)
            status = DeliveryStatus.FAILED
        AlertEvent.objects.filter(pk=event_id, **{field: DeliveryStatus.SENDING}).update(
            **{field: status}
        )
        outcome[field] = status

    if transient:
        AlertEvent.objects.filter(pk=event_id).update(attempts=F("attempts") + 1)
    retry = [field for field, status in outcome.items() if status == DeliveryStatus.PENDING]
    if retry:
        raise RetryLater(f"Alert {event_id}: retry {', '.join(retry)}")
    return outcome


def _claim(event_id: int, field: str) -> bool:
    claimed = AlertEvent.objects.filter(pk=event_id, **{field: DeliveryStatus.PENDING}).update(
        **{field: DeliveryStatus.SENDING}
    )
    return claimed == 1


def _send_push(event: AlertEvent) -> str:
    user = event.user
    if not (user.plan.allows_push and user.notify_push):
        return DeliveryStatus.SKIPPED
    if not (settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY):
        logger.warning("Alert %s: push skipped, the VAPID keys are not configured", event.pk)
        return DeliveryStatus.SKIPPED
    subscriptions = list(PushSubscription.objects.filter(user=user).order_by("id"))
    payload = json.dumps(
        {"title": event.title, "body": event.body, "url": "/alertas", "tag": f"alert-{event.pk}"},
        ensure_ascii=False,
    )
    sent, rejected, transient = 0, 0, []
    for subscription in subscriptions:
        try:
            webpush(
                {
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
                ttl=PUSH_TTL_SECONDS,
                timeout=PUSH_TIMEOUT_SECONDS,
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in GONE_STATUSES or status in BROKEN_STATUSES:
                if status not in GONE_STATUSES:
                    logger.warning(
                        "Alert %s: dropping a broken subscription (%s)", event.pk, status
                    )
                subscription.delete()
                continue
            if status in REJECTED_STATUSES:
                rejected += 1
                logger.error(
                    "Alert %s: the push service rejected our VAPID credentials (%s)",
                    event.pk,
                    status,
                )
                continue
            transient.append(f"push service answered {status}")
        except requests.RequestException as exc:
            transient.append(f"network error {type(exc).__name__}")
        else:
            sent += 1
    if transient:
        # Devices that already got it get it again on the retry; the tag replaces it in place.
        raise TransientFailure("; ".join(transient))
    if sent:
        return DeliveryStatus.SENT
    return DeliveryStatus.FAILED if rejected else DeliveryStatus.SKIPPED


def _send_email(event: AlertEvent) -> str:
    user = event.user
    if not user.notify_email:
        return DeliveryStatus.SKIPPED
    body = EMAIL_BODY.format(body=event.body, url=settings.PUBLIC_APP_URL)
    try:
        send_mail(event.title, body, None, [user.email])
    except OSError as exc:  # smtplib.SMTPException is an OSError too
        raise TransientFailure(f"email {type(exc).__name__}") from exc
    return DeliveryStatus.SENT
