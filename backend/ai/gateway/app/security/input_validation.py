"""
Input Validation — sanitizes all API inputs.
Prevents SQL injection, XSS, command injection, and malformed data.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class ValidationResult:
    is_valid: bool
    sanitized_value: str | None
    error: str | None = None


class InputValidator:
    """Validates and sanitizes all user inputs."""

    # Indian phone: +91 followed by 10 digits
    PHONE_PATTERN = re.compile(r'^\+91[6-9]\d{9}$')

    # Indian vehicle number: 2 letters + 2 digits + 1-3 letters + 4 digits
    VEHICLE_PATTERN = re.compile(r'^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$')

    # GSTIN: 15 chars (2 state + 10 PAN + 1 entity + 1 Z + 1 checksum)
    GSTIN_PATTERN = re.compile(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[Z]{1}[A-Z\d]{1}$')

    # PAN: 5 letters + 4 digits + 1 letter
    PAN_PATTERN = re.compile(r'^[A-Z]{5}\d{4}[A-Z]{1}$')

    # Aadhaar: 12 digits
    AADHAAR_PATTERN = re.compile(r'^\d{12}$')

    # UPI ID: name@bank
    UPI_PATTERN = re.compile(r'^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$')

    # TYRE load code: TYRE-XXXX
    TYRE_CODE_PATTERN = re.compile(r'^TYRE[-]?\d{4,6}$', re.IGNORECASE)

    # Maximum input lengths
    MAX_TEXT_LENGTH = 4000
    MAX_VOICE_DURATION_SEC = 120
    MAX_PHONE_LENGTH = 15

    # Dangerous patterns (SQL injection, XSS, command injection)
    SQL_INJECTION_PATTERNS = [
        r"(\b(DELETE|DROP|INSERT|UPDATE|SELECT|UNION|CREATE|ALTER|EXEC|SCRIPT)\b)",
        r"(--|/\*|\*/|;|@@|@)",
        r"(\bOR\b\s+\d+\s*=\s*\d+)",
        r"(\bAND\b\s+\d+\s*=\s*\d+)",
    ]
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe",
        r"<embed",
        r"<object",
    ]

    def validate_phone(self, phone: str) -> ValidationResult:
        """Validate Indian phone number."""
        phone = phone.strip()
        if not phone:
            return ValidationResult(False, None, "Phone number required")
        if len(phone) > self.MAX_PHONE_LENGTH:
            return ValidationResult(False, None, "Phone number too long")
        if not self.PHONE_PATTERN.match(phone):
            return ValidationResult(False, None, "Invalid Indian phone format (use +91XXXXXXXXXX)")
        return ValidationResult(True, phone)

    def validate_vehicle_number(self, vehicle: str) -> ValidationResult:
        """Validate Indian vehicle number."""
        vehicle = vehicle.upper().replace(" ", "").strip()
        if not vehicle:
            return ValidationResult(False, None, "Vehicle number required")
        if not self.VEHICLE_PATTERN.match(vehicle):
            return ValidationResult(False, None, "Invalid vehicle number format (e.g., BR01AB1234)")
        return ValidationResult(True, vehicle)

    def validate_gstin(self, gstin: str) -> ValidationResult:
        """Validate GSTIN."""
        gstin = gstin.upper().strip()
        if not gstin:
            return ValidationResult(False, None, "GSTIN required")
        if not self.GSTIN_PATTERN.match(gstin):
            return ValidationResult(False, None, "Invalid GSTIN format (15 characters)")
        return ValidationResult(True, gstin)

    def validate_pan(self, pan: str) -> ValidationResult:
        """Validate PAN."""
        pan = pan.upper().strip()
        if not pan:
            return ValidationResult(False, None, "PAN required")
        if not self.PAN_PATTERN.match(pan):
            return ValidationResult(False, None, "Invalid PAN format (10 characters)")
        return ValidationResult(True, pan)

    def validate_aadhaar(self, aadhaar: str) -> ValidationResult:
        """Validate Aadhaar number."""
        aadhaar = aadhaar.strip().replace(" ", "").replace("-", "")
        if not aadhaar:
            return ValidationResult(False, None, "Aadhaar number required")
        if not self.AADHAAR_PATTERN.match(aadhaar):
            return ValidationResult(False, None, "Invalid Aadhaar format (12 digits)")
        return ValidationResult(True, aadhaar)

    def validate_upi_id(self, upi_id: str) -> ValidationResult:
        """Validate UPI ID."""
        upi_id = upi_id.strip().lower()
        if not upi_id:
            return ValidationResult(False, None, "UPI ID required")
        if not self.UPI_PATTERN.match(upi_id):
            return ValidationResult(False, None, "Invalid UPI ID format (e.g., name@bank)")
        return ValidationResult(True, upi_id)

    def validate_text(self, text: str, max_length: int = None) -> ValidationResult:
        """Validate and sanitize free-text input. Checks for injection attacks."""
        if text is None:
            return ValidationResult(False, None, "Text required")
        max_len = max_length or self.MAX_TEXT_LENGTH
        if len(text) > max_len:
            return ValidationResult(False, None, f"Text too long (max {max_len} chars)")

        # Check for SQL injection
        text_lower = text.lower()
        for pattern in self.SQL_INJECTION_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return ValidationResult(False, None, "Potentially dangerous input detected")

        # Check for XSS
        for pattern in self.XSS_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return ValidationResult(False, None, "Potentially dangerous input detected")

        # Sanitize: strip control characters
        sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        return ValidationResult(True, sanitized)

    def validate_amount_inr(self, amount: float) -> ValidationResult:
        """Validate monetary amount in INR."""
        if amount is None or amount <= 0:
            return ValidationResult(False, None, "Amount must be positive")
        if amount > 10_000_000:  # 1 crore max
            return ValidationResult(False, None, "Amount exceeds maximum (₹1 crore)")
        return ValidationResult(True, str(amount))

    def validate_tyre_code(self, code: str) -> ValidationResult:
        """Validate TYRE load code."""
        code = code.upper().strip()
        if not code:
            return ValidationResult(False, None, "TYRE code required")
        if not self.TYRE_CODE_PATTERN.match(code):
            return ValidationResult(False, None, "Invalid TYRE code format (TYRE-XXXX)")
        return ValidationResult(True, code)

    def validate_locale(self, locale: str) -> ValidationResult:
        """Validate locale code against Y1 active locales."""
        from app.i18n.locales import LOCALE_MAP
        locale = locale.strip().lower()
        if not locale:
            return ValidationResult(False, None, "Locale required")
        if locale not in LOCALE_MAP:
            return ValidationResult(False, None, f"Unsupported locale: {locale}")
        return ValidationResult(True, locale)
