"""Telegram Broker Bot — broker / fleet-manager side of the WhatsApp↔Telegram bridge.

Per the Week 1 plan (docs/WEBHOOKS.md §3):
  - `/start` and `/link` onboarding → link Telegram chat_id to a Broker row
  - `/loads`, `/status`, `/help` basic commands
  - Proactive push methods (load requests, payment confirmations) consumed
    by the bridge agent (Week 2) and payment agent

Telegram is the broker channel because brokers are tech-savvy, Telegram is
free for business messaging, and inline keyboards (up to 100 buttons) fit
broker workflows better than WhatsApp's 3-button reply limit.
"""
from . import bot_client
from .broker_bot import TelegramBrokerBot, TelegramReply, TelegramUpdate

__all__ = [
    "TelegramBrokerBot",
    "TelegramUpdate",
    "TelegramReply",
    "bot_client",
]
