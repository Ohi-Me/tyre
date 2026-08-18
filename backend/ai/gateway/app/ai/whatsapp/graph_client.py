"""WhatsApp Business Cloud API client — Phase 0 fix.

Before Phase 0, `self._whatsapp_token = ""` in `driver_bot.py` and every "send" call in
`upi_escrow.py` / `consignee_confirm.py` was a comment (`# await self._send_whatsapp(...)`)
that never ran. This module makes the one real send-call documented in `ARCHITECTURE.md`
§8 and Phase 0's exit criteria: a real POST to Meta's Graph API.

Also implements the SMS fallback flagged in `ARCHITECTURE.md` §13 ("Meta Graph API down
(WhatsApp) ... No mitigation — Phase 3 must add SMS fallback for consignee confirm").
We bring that mitigation forward into Phase 0 since it's the same code path.
"""
from __future__ import annotations

import logging

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings

logger = logging.getLogger("tyre.whatsapp")


class WhatsAppSendError(Exception):
    pass


def is_configured() -> bool:
    return bool(settings.whatsapp_token and settings.whatsapp_phone_number_id)


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=2),
    retry=retry_if_exception_type(httpx.TransportError),
    reraise=True,
)
async def send_text_message(to_phone: str, text: str) -> dict:
    """POST /{phone_number_id}/messages — real Meta Graph API call.

    Returns {"success": bool, "message_id": str | None, "error": str | None}.
    Never raises for an API-level failure (4xx from Meta) — only network errors are retried;
    callers (driver_bot, upi_escrow notifications, consignee_confirm) need a result object,
    not an exception, because a failed WhatsApp send must fall back to SMS, not crash the flow.
    """
    if not is_configured():
        logger.warning("[whatsapp] send skipped — TYRE_WHATSAPP_TOKEN/PHONE_NUMBER_ID not configured")
        return {"success": False, "message_id": None, "error": "whatsapp_not_configured"}

    url = f"https://graph.facebook.com/{settings.whatsapp_api_version}/{settings.whatsapp_phone_number_id}/messages"
    body = {
        "messaging_product": "whatsapp",
        "to": _normalize_phone(to_phone),
        "type": "text",
        "text": {"body": text},
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                url,
                json=body,
                headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
            )
        if resp.status_code >= 400:
            logger.error("[whatsapp] send failed %s: %s", resp.status_code, resp.text[:300])
            return {"success": False, "message_id": None, "error": f"http_{resp.status_code}"}
        data = resp.json()
        message_id = (data.get("messages") or [{}])[0].get("id")
        return {"success": True, "message_id": message_id, "error": None}
    except Exception as e:  # noqa: BLE001 — network-level failure, not a Meta API rejection
        logger.error("[whatsapp] send raised: %s", e)
        return {"success": False, "message_id": None, "error": str(e)}


async def send_interactive_buttons(to_phone: str, text: str, buttons: list[dict]) -> dict:
    """POST interactive reply-button message. `buttons`: [{"id": str, "title": str}, ...] (max 3)."""
    if not is_configured():
        return {"success": False, "message_id": None, "error": "whatsapp_not_configured"}

    url = f"https://graph.facebook.com/{settings.whatsapp_api_version}/{settings.whatsapp_phone_number_id}/messages"
    body = {
        "messaging_product": "whatsapp",
        "to": _normalize_phone(to_phone),
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": text},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": {"id": b["id"], "title": b["title"][:20]}}
                    for b in buttons[:3]
                ]
            },
        },
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, json=body, headers={"Authorization": f"Bearer {settings.whatsapp_token}"})
        if resp.status_code >= 400:
            return {"success": False, "message_id": None, "error": f"http_{resp.status_code}"}
        data = resp.json()
        return {"success": True, "message_id": (data.get("messages") or [{}])[0].get("id"), "error": None}
    except Exception as e:  # noqa: BLE001
        logger.error("[whatsapp] interactive send raised: %s", e)
        return {"success": False, "message_id": None, "error": str(e)}


def _normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        return f"91{digits}"  # Y1: India only
    return digits


# ── SMS fallback — ARCHITECTURE.md §13 failure-mode mitigation ─────────────────

async def send_sms(to_phone: str, text: str) -> dict:
    """Generic SMS fallback used when WhatsApp send fails (Meta Graph API down, or the
    recipient has no WhatsApp). Supports MSG91 (India-first) or Twilio via
    `TYRE_SMS_PROVIDER`. No-ops with a clear error if unconfigured rather than pretending
    to send — matching the rest of this module's "fail loud in logs, not silently" pattern.
    """
    if not settings.sms_provider or not settings.sms_api_key:
        logger.warning("[sms] send skipped — TYRE_SMS_PROVIDER/TYRE_SMS_API_KEY not configured")
        return {"success": False, "error": "sms_not_configured"}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if settings.sms_provider == "msg91":
                resp = await client.post(
                    "https://control.msg91.com/api/v5/flow/",
                    json={"sender": settings.sms_sender_id, "mobiles": _normalize_phone(to_phone), "message": text},
                    headers={"authkey": settings.sms_api_key},
                )
            elif settings.sms_provider == "twilio":
                resp = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.sms_sender_id}/Messages.json",
                    data={"To": f"+{_normalize_phone(to_phone)}", "From": settings.sms_sender_id, "Body": text},
                    auth=(settings.sms_sender_id, settings.sms_api_key),
                )
            else:
                return {"success": False, "error": f"unknown_provider:{settings.sms_provider}"}

        if resp.status_code >= 400:
            return {"success": False, "error": f"http_{resp.status_code}"}
        return {"success": True, "error": None}
    except Exception as e:  # noqa: BLE001
        logger.error("[sms] send raised: %s", e)
        return {"success": False, "error": str(e)}


async def send_with_sms_fallback(to_phone: str, text: str) -> dict:
    """Try WhatsApp first; if it fails for any reason, fall back to SMS.
    This is the concrete implementation of the §13 mitigation row."""
    result = await send_text_message(to_phone, text)
    if result["success"]:
        return {"channel": "whatsapp", **result}
    sms_result = await send_sms(to_phone, text)
    return {"channel": "sms" if sms_result["success"] else "none", **sms_result}
