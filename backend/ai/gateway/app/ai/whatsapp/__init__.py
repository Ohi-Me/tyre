"""
WhatsApp-First Driver Bot — 80% of drivers use WhatsApp, not apps.

Per V2 PDF Part 4.1 — 10 workflows that stay in WhatsApp:
  - Load search
  - Load accept
  - Status update
  - Payment confirmation
  - Return load suggestion
  - Market rate query
  - Emergency help
  - Onboarding (initial)
  - KYC submission
  - Truck photos
"""
from .driver_bot import WhatsAppDriverBot

__all__ = ["WhatsAppDriverBot"]
