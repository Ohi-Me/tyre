"""Telegram Bot API client — broker / fleet-manager channel.

Mirrors `app/ai/whatsapp/graph_client.py` shape so the rest of the codebase has
one consistent "send a message to a messaging channel" pattern across both
sides of the WhatsApp↔Telegram bridge (Week 1 of the bridge epic).

Why Telegram is *easier* than WhatsApp here:
  - No Meta Business verification / KYC — get a token from @BotFather in 30s.
  - Bot API is free and unlimited (WhatsApp Business API charges ₹0.85–₹1.5
    per conversation).
  - Webhook auth is one shared `secret_token` header (`X-Telegram-Bot-Api-Secret-Token`),
    no HMAC handshake, no GET challenge step.

Same "fail loud in logs, not silently" rule as the WhatsApp client: a 4xx from
Telegram is logged and returned as a failed result dict; network errors are
retried via tenacity; never raises out to the caller because a failed Telegram
send must not crash a flow that has already dispatched a load or released a
payment.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings

logger = logging.getLogger("tyre.telegram")


class TelegramSendError(Exception):
    pass


def is_configured() -> bool:
    """True iff TYRE_TELEGRAM_BOT_TOKEN is set. The webhook secret is only
    required for *inbound* verification, not outbound sends."""
    return bool(settings.telegram_bot_token)


def _bot_url(method: str) -> str:
    """Build the Bot API URL for a given method, e.g. bot123:abc/sendMessage."""
    return f"{settings.telegram_api_base.rstrip('/')}/bot{settings.telegram_bot_token}/{method}"


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.5, min=0.5, max=2),
    retry=retry_if_exception_type(httpx.TransportError),
    reraise=True,
)
async def send_message(
    chat_id: str | int,
    text: str,
    *,
    parse_mode: str | None = "HTML",
    reply_markup: dict[str, Any] | None = None,
    disable_web_page_preview: bool = True,
) -> dict:
    """POST /bot<token>/sendMessage — real Telegram Bot API call.

    Returns `{"success": bool, "message_id": str | None, "error": str | None}`.
    Never raises for an API-level failure (4xx from Telegram) — only network
    errors are retried; callers (broker_bot, bridge agent, payment agent
    broker-notifications) need a result object, not an exception, because a
    failed Telegram send must degrade gracefully (e.g. fall back to the broker
    dashboard), not crash the flow.
    """
    if not is_configured():
        logger.warning("[telegram] send skipped — TYRE_TELEGRAM_BOT_TOKEN not configured")
        return {"success": False, "message_id": None, "error": "telegram_not_configured"}

    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": disable_web_page_preview,
    }
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(_bot_url("sendMessage"), json=payload)
        if resp.status_code >= 400:
            logger.error("[telegram] send failed %s: %s", resp.status_code, resp.text[:300])
            return {"success": False, "message_id": None, "error": f"http_{resp.status_code}"}
        data = resp.json()
        if not data.get("ok"):
            logger.error("[telegram] send !ok: %s", data.get("description", "")[:300])
            return {
                "success": False,
                "message_id": None,
                "error": data.get("description") or "telegram_api_error",
            }
        message_id = (data.get("result") or {}).get("message_id")
        return {"success": True, "message_id": message_id, "error": None}
    except Exception as e:  # noqa: BLE001 — network-level failure, not a Telegram API rejection
        logger.error("[telegram] send raised: %s", e)
        return {"success": False, "message_id": None, "error": str(e)}


async def send_inline_buttons(
    chat_id: str | int,
    text: str,
    buttons: list[list[dict[str, str]]],
    *,
    parse_mode: str | None = "HTML",
) -> dict:
    """Send a message with inline keyboard buttons.

    `buttons` is a list of rows; each row is a list of button dicts of shape
    `{"text": "Accept", "callback_data": "accept:TYRE-0001"}`. Telegram allows
    up to 8 buttons per row and 100 per message — far more than WhatsApp's
    3-button reply limit, which is one of the reasons brokers get the Telegram
    side of the bridge.
    """
    reply_markup = {"inline_keyboard": buttons}
    return await send_message(chat_id, text, parse_mode=parse_mode, reply_markup=reply_markup)


async def answer_callback_query(callback_query_id: str, text: str | None = None) -> dict:
    """Answer a callback query — removes the loading spinner on the broker's
    button press and optionally shows a small toast. Required for any inline
    button flow (otherwise the broker's Telegram client shows the spinner
    indefinitely)."""
    if not is_configured():
        return {"success": False, "error": "telegram_not_configured"}
    payload: dict[str, Any] = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(_bot_url("answerCallbackQuery"), json=payload)
        if resp.status_code >= 400:
            return {"success": False, "error": f"http_{resp.status_code}"}
        data = resp.json()
        return {"success": bool(data.get("ok")), "error": None if data.get("ok") else data.get("description")}
    except Exception as e:  # noqa: BLE001
        logger.error("[telegram] answer_callback_query raised: %s", e)
        return {"success": False, "error": str(e)}


async def set_webhook(webhook_url: str, secret_token: str) -> dict:
    """POST /bot<token>/setWebhook — register the webhook with Telegram.

    Used by the deploy runbook (`docs/WEBHOOKS.md` §3). Exposed as a function
    here (rather than a one-shot script) so it can be re-run after a domain
    change without redeploying the gateway. Idempotent — calling it again with
    the same URL just refreshes the secret.
    """
    if not is_configured():
        return {"success": False, "error": "telegram_not_configured"}
    payload = {"url": webhook_url, "allowed_updates": ["message", "callback_query"]}
    if secret_token:
        # Telegram requires the secret to be 1-256 chars of A-Z a-z 0-9 _ -.
        payload["secret_token"] = secret_token
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(_bot_url("setWebhook"), json=payload)
        data = resp.json()
        return {"success": bool(data.get("ok")), "description": data.get("description"), "raw": data}
    except Exception as e:  # noqa: BLE001
        logger.error("[telegram] set_webhook raised: %s", e)
        return {"success": False, "error": str(e)}


async def get_me() -> dict:
    """GET /bot<token>/getMe — sanity check that the bot token is valid and to
    fetch the bot's @username for the onboarding message. Used by the deploy
    runbook and by the /start handler when bootstrapping a new broker."""
    if not is_configured():
        return {"success": False, "error": "telegram_not_configured"}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(_bot_url("getMe"))
        data = resp.json()
        if not data.get("ok"):
            return {"success": False, "error": data.get("description")}
        return {"success": True, "bot": data.get("result"), "error": None}
    except Exception as e:  # noqa: BLE001
        logger.error("[telegram] get_me raised: %s", e)
        return {"success": False, "error": str(e)}
