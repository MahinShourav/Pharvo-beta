"""WhatsApp order notifications via the official Meta WhatsApp Cloud API.

Configuration comes ONLY from environment variables (see config.settings and
.env.example). No credential is hardcoded, logged, or returned to clients:

- WHATSAPP_PHONE_NUMBER_ID: sender Phone-Number-ID from Meta
- WHATSAPP_ACCESS_TOKEN: long-lived system-user / temporary access token
- WHATSAPP_API_URL: override for the Graph base URL (default v21.0)
- WHATSAPP_TIMEOUT_SECONDS: provider HTTP timeout

The supplier has no dedicated WhatsApp column in the existing schema, so the
supplier's configured `phone` number is used as the recipient.
"""

import json
import logging
import re
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from django.conf import settings

logger = logging.getLogger(__name__)


class WhatsAppError(Exception):
    """The provider could not deliver the message (mapped to HTTP 502).

    Carries an optional token-free `detail` (Meta error code/message) that
    is safe to show to staff users and to include in log records.
    """

    def __init__(self, message, detail=""):
        super().__init__(message)
        self.detail = detail


class WhatsAppNotConfigured(Exception):
    """Provider credentials are absent (mapped to HTTP 503)."""


def is_configured():
    """True only when every required credential is present."""
    return bool(
        getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "")
        and getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")
    )


def normalize_recipient(phone):
    """Digits-only E.164 recipient (no leading '+'), or None when unusable.

    Bangladesh local mobiles (01XXXXXXXXX, 11 digits) gain the 880 country
    code, e.g. 01601969980 -> 8801601969980, which is what the Meta API
    expects. Already-coded 880... numbers pass through unchanged, as does
    any other 7-15 digit international number.
    """
    digits = re.sub(r"\D", "", str(phone or ""))
    if re.fullmatch(r"01[3-9]\d{8}", digits):
        digits = "880" + digits[1:]
    if not re.fullmatch(r"\d{7,15}", digits):
        return None
    return digits


def provider_error_summary(raw_body):
    """Short human-readable Meta error (code + message), token-free."""
    try:
        err = (json.loads(raw_body or "") or {}).get("error") or {}
        code = err.get("code")
        message = str(err.get("message") or "").strip()
        if code is not None and message:
            return f"Meta error {code}: {message}"[:300]
        if message:
            return message[:300]
    except (ValueError, AttributeError):
        pass
    text = (raw_body or "").strip()
    return text[:300] if text else ""


def pharmacy_details():
    return {
        "name": getattr(settings, "PHARMACY_NAME", "PHARVO Pharmacy")
        or "PHARVO Pharmacy",
        "phone": getattr(settings, "PHARMACY_PHONE", "") or "",
        "address": getattr(settings, "PHARMACY_ADDRESS", "") or "",
    }


def compose_order_message(
    *, order_ref, pharmacy, supplier_name, items, estimated_total, delivery_note,
    order_date="",
):
    """Build the order text: ID, pharmacy, medicines, quantities, delivery.

    Each item carries its order unit ("box"/"pc", default "pc"): Box-based
    medicines are messaged as Boxes, Cream/Syrup as PC.
    """
    contact = pharmacy["name"]
    if pharmacy.get("phone"):
        contact += f" ({pharmacy['phone']})"
    lines = [
        "PHARVO Supplier Order",
        "",
        f"Order ID: {order_ref} from {contact}.",
        f"Supplier: {supplier_name}",
        "",
    ]
    if order_date:
        lines.append(f"Order date: {order_date}")
        lines.append("")
    for item in items:
        unit = str(item.get("unit") or "pc").lower()
        qty = item["quantity"]
        noun = "PC" if unit != "box" else ("Box" if qty == 1 else "Boxes")
        lines.append(f"- {item['name']}: {qty} {noun}")
    lines.append("")
    lines.append(f"Estimated total: {estimated_total}")
    if delivery_note:
        lines.append("")
        lines.append(f"Delivery request: {delivery_note}")
    if pharmacy.get("address"):
        lines.append(f"Deliver to: {pharmacy['address']}")
    lines.append("")
    lines.append("Please confirm availability and delivery time.")
    return "\n".join(lines)


def send_text_message(to_digits, text):
    """Send one text message; returns the provider message id.

    Raises WhatsAppNotConfigured when credentials are absent and
    WhatsAppError when delivery fails. The access token is sent only in the
    Authorization header and is never included in errors, logs, or responses.
    """
    if not is_configured():
        raise WhatsAppNotConfigured(
            "WhatsApp sending is not configured on the server."
        )
    api_url = (
        getattr(settings, "WHATSAPP_API_URL", "")
        or "https://graph.facebook.com/v21.0"
    ).rstrip("/")
    phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
    url = f"{api_url}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_digits,
        "type": "text",
        "text": {"body": text},
    }
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            # Token travels only in this header; never logged or returned.
            "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    timeout = getattr(settings, "WHATSAPP_TIMEOUT_SECONDS", 15) or 15
    try:
        with urlopen(req, timeout=timeout) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", "replace")
    except HTTPError as exc:
        try:
            raw = exc.read().decode("utf-8", "replace")
        except Exception:
            raw = ""
        detail = provider_error_summary(raw)
        logger.warning(
            "WhatsApp provider rejected the request: HTTP %s %s",
            exc.code,
            detail,
        )
        raise WhatsAppError(
            f"provider rejected the request (HTTP {exc.code})", detail=detail
        )
    except Exception:
        logger.warning("WhatsApp provider unreachable")
        raise WhatsAppError("could not reach the WhatsApp provider")
    if status < 200 or status >= 300:
        raise WhatsAppError(f"provider returned HTTP {status}")
    try:
        message_id = json.loads(body or "{}")["messages"][0]["id"]
    except (KeyError, IndexError, TypeError, ValueError):
        raise WhatsAppError("provider response did not contain a message id")
    # Safe audit trail: HTTP status, recipient, sender ID and Meta message ID.
    # The access token is never part of any log record.
    logger.info(
        "WhatsApp message accepted: http=%s id=%s to=%s sender=%s",
        status,
        message_id,
        to_digits,
        phone_number_id,
    )
    return message_id
