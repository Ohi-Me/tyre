"""
PII Encryption — encrypts sensitive data (Aadhaar, PAN, bank details) at rest.

AI-C11 fix: previously this module used base64 encoding (which is reversible
encoding, NOT encryption) and was never used outside tests. The class is now
honest about its limitations:
  - hash_pii() uses HMAC-SHA256 with the configured key (one-way, lookup-safe).
  - encrypt()/decrypt() raise NotImplementedError in production unless a real
    encryption backend (cryptography.fernet / AWS KMS) is configured.
  - mask_* methods remain (they are display helpers, not security controls).

The BFF already has its own PII extension at
backend/database/prisma/pii-encryption.ts (which is the canonical implementation).
This Python class exists only for the gateway's rare direct-DB writes (none in Y1)
and for masking PII before logging.
"""
from __future__ import annotations

import hashlib
import hmac
import os


class PIIEncryptor:
    """
    PII hashing + masking helper for the Python AI gateway.

    NOTE: The canonical PII encryption lives in the BFF's Prisma extension
    (backend/database/prisma/pii-encryption.ts). This class only provides:
      - hash_pii(): HMAC-SHA256 for deterministic lookup
      - mask_*(): display helpers
    """

    PII_FIELDS = {"aadhaar", "pan", "bank_account", "upi_id", "phone", "gstin"}

    def __init__(self):
        self._encryption_key = os.getenv("TYRE_PII_ENCRYPTION_KEY")

    def hash_pii(self, value: str) -> str:
        """HMAC-SHA256 for deterministic lookup. Same input + key → same hash."""
        if not self._encryption_key:
            # AI-C11: do NOT silently degrade — raise so misconfiguration is visible
            raise RuntimeError(
                "TYRE_PII_ENCRYPTION_KEY not set. Cannot hash PII without a key."
            )
        return hmac.new(
            self._encryption_key.encode("utf-8"),
            value.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def encrypt(self, value: str) -> str:
        """
        AI-C11 fix: previously returned base64.b64encode(value) — encoding, not
        encryption. Now raises NotImplementedError unless a real backend is wired.
        The BFF handles encryption at the Prisma boundary; the gateway should not
        write PII to the DB directly.
        """
        raise NotImplementedError(
            "PII encryption is handled by the BFF's Prisma extension. "
            "The gateway must not write PII to the DB directly. "
            "If you need to log PII, use mask_*() instead."
        )

    def decrypt(self, encrypted: str) -> str:
        """AI-C11 fix: symmetric to encrypt() — not implemented in the gateway."""
        raise NotImplementedError(
            "PII decryption is handled by the BFF's Prisma extension."
        )

    def mask_aadhaar(self, aadhaar: str) -> str:
        """Mask Aadhaar for display: XXXX-XXXX-1234"""
        if len(aadhaar) != 12:
            return "XXXX-XXXX-XXXX"
        return f"XXXX-XXXX-{aadhaar[8:12]}"

    def mask_pan(self, pan: str) -> str:
        """Mask PAN for display: ABCDE1234X"""
        if len(pan) != 10:
            return "XXXXXXXXXX"
        return f"{pan[:5]}XXXX{pan[9]}"

    def mask_phone(self, phone: str) -> str:
        """Mask phone for display: +91-XXXX-XX-1234"""
        if len(phone) < 10:
            return phone
        return f"{phone[:6]}XXXX{phone[-4:]}"

    def mask_upi(self, upi_id: str) -> str:
        """Mask UPI ID for display: raXXX@upi"""
        if "@" not in upi_id:
            return upi_id
        name, bank = upi_id.split("@", 1)
        if len(name) <= 2:
            return f"{name}***@{bank}"
        return f"{name[:2]}***@{bank}"

    def mask_gstin(self, gstin: str) -> str:
        """Mask GSTIN for display: 10ABCDE*****1Z5"""
        if len(gstin) != 15:
            return gstin
        return f"{gstin[:8]}*****{gstin[12:]}"

    def mask_all(self, pii_type: str, value: str) -> str:
        """Mask any PII type for display."""
        masks = {
            "aadhaar": self.mask_aadhaar,
            "pan": self.mask_pan,
            "phone": self.mask_phone,
            "upi_id": self.mask_upi,
            "gstin": self.mask_gstin,
        }
        return masks.get(pii_type, lambda v: v)(value)
