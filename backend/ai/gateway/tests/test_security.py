"""
Test the Security Layer — input validation, rate limiting, PII encryption, auth.
"""
import pytest

from app.security.auth_middleware import AuthContext, AuthMiddleware
from app.security.input_validation import InputValidator
from app.security.pii_encryption import PIIEncryptor
from app.security.rate_limiter import RateLimiter

# ─────────────────────────────────────────────────────────────────
# Input Validation Tests
# ─────────────────────────────────────────────────────────────────

@pytest.fixture
def validator():
    return InputValidator()


def test_validate_phone_valid(validator):
    """Valid Indian phone = pass."""
    result = validator.validate_phone("+919876543210")
    assert result.is_valid is True
    assert result.sanitized_value == "+919876543210"


def test_validate_phone_invalid_format(validator):
    """Non-Indian phone = fail."""
    result = validator.validate_phone("+1234567890")
    assert result.is_valid is False
    assert "Invalid Indian phone" in result.error


def test_validate_phone_empty(validator):
    """Empty phone = fail."""
    result = validator.validate_phone("")
    assert result.is_valid is False


def test_validate_vehicle_valid(validator):
    """Valid vehicle number = pass."""
    result = validator.validate_vehicle_number("BR01AB1234")
    assert result.is_valid is True
    assert result.sanitized_value == "BR01AB1234"


def test_validate_vehicle_lowercased(validator):
    """Lowercase vehicle = normalized + pass."""
    result = validator.validate_vehicle_number("br01ab1234")
    assert result.is_valid is True
    assert result.sanitized_value == "BR01AB1234"


def test_validate_vehicle_with_spaces(validator):
    """Vehicle with spaces = normalized + pass."""
    result = validator.validate_vehicle_number("BR 01 AB 1234")
    assert result.is_valid is True
    assert result.sanitized_value == "BR01AB1234"


def test_validate_vehicle_invalid(validator):
    """Invalid vehicle = fail."""
    result = validator.validate_vehicle_number("XYZ")
    assert result.is_valid is False


def test_validate_gstin_valid(validator):
    """Valid GSTIN = pass."""
    result = validator.validate_gstin("27ABCDE1234F1Z5")
    assert result.is_valid is True


def test_validate_gstin_invalid(validator):
    """Invalid GSTIN = fail."""
    result = validator.validate_gstin("INVALID")
    assert result.is_valid is False


def test_validate_pan_valid(validator):
    """Valid PAN = pass."""
    result = validator.validate_pan("ABCDE1234F")
    assert result.is_valid is True


def test_validate_pan_lowercased(validator):
    """Lowercase PAN = normalized."""
    result = validator.validate_pan("abcde1234f")
    assert result.is_valid is True
    assert result.sanitized_value == "ABCDE1234F"


def test_validate_aadhaar_valid(validator):
    """Valid Aadhaar = pass."""
    result = validator.validate_aadhaar("123456789012")
    assert result.is_valid is True


def test_validate_aadhaar_with_spaces(validator):
    """Aadhaar with spaces = normalized."""
    result = validator.validate_aadhaar("1234 5678 9012")
    assert result.is_valid is True
    assert result.sanitized_value == "123456789012"


def test_validate_aadhaar_invalid(validator):
    """Invalid Aadhaar = fail."""
    result = validator.validate_aadhaar("12345")
    assert result.is_valid is False


def test_validate_upi_valid(validator):
    """Valid UPI ID = pass."""
    result = validator.validate_upi_id("ramesh@upi")
    assert result.is_valid is True


def test_validate_upi_invalid(validator):
    """Invalid UPI ID = fail."""
    result = validator.validate_upi_id("invalid")
    assert result.is_valid is False


# ─────────────────────────────────────────────────────────────────
# SQL Injection / XSS Tests
# ─────────────────────────────────────────────────────────────────

def test_validate_text_blocks_sql_injection(validator):
    """SQL injection attempt = blocked."""
    result = validator.validate_text("'; DROP TABLE users; --")
    assert result.is_valid is False
    assert "dangerous" in result.error.lower()


def test_validate_text_blocks_xss(validator):
    """XSS attempt = blocked."""
    result = validator.validate_text("<script>alert('xss')</script>")
    assert result.is_valid is False
    assert "dangerous" in result.error.lower()


def test_validate_text_blocks_union_select(validator):
    """UNION SELECT = blocked."""
    result = validator.validate_text("1 UNION SELECT * FROM passwords")
    assert result.is_valid is False


def test_validate_text_allows_normal_text(validator):
    """Normal text = pass."""
    result = validator.validate_text("Patna se Delhi load chahiye")
    assert result.is_valid is True


def test_validate_text_strips_control_chars(validator):
    """Control characters = stripped."""
    result = validator.validate_text("hello\x00\x01world")
    assert result.is_valid is True
    assert "\x00" not in result.sanitized_value
    assert "\x01" not in result.sanitized_value


def test_validate_text_max_length(validator):
    """Text over max length = fail."""
    result = validator.validate_text("x" * 5000)
    assert result.is_valid is False
    assert "too long" in result.error.lower()


# ─────────────────────────────────────────────────────────────────
# Rate Limiter Tests
# ─────────────────────────────────────────────────────────────────

@pytest.fixture
def limiter():
    return RateLimiter(use_redis=False)


@pytest.mark.asyncio
async def test_rate_limiter_allows_under_limit(limiter):
    """Under limit = allowed."""
    limiter.clear()
    for i in range(5):
        result = await limiter.check("test_key_1", "default")
        assert result.allowed is True


@pytest.mark.asyncio
async def test_rate_limiter_blocks_over_limit(limiter):
    """Over limit = blocked."""
    limiter.clear()
    # Default limit is 60 per 60 seconds — use voice (20 per 60s)
    for i in range(20):
        result = await limiter.check("test_key_2", "voice")
        assert result.allowed is True
    # 21st should be blocked
    result = await limiter.check("test_key_2", "voice")
    assert result.allowed is False
    assert result.remaining == 0


@pytest.mark.asyncio
async def test_rate_limiter_different_keys_independent(limiter):
    """Different keys have independent limits."""
    limiter.clear()
    # Exhaust key A
    for i in range(20):
        await limiter.check("key_A", "voice")
    # Key B should still be allowed
    result = await limiter.check("key_B", "voice")
    assert result.allowed is True


@pytest.mark.asyncio
async def test_rate_limiter_escrow_advance_strict(limiter):
    """Escrow advance = 5 per minute (strict)."""
    limiter.clear()
    for i in range(5):
        result = await limiter.check("test_escrow", "escrow_advance")
        assert result.allowed is True
    result = await limiter.check("test_escrow", "escrow_advance")
    assert result.allowed is False


# ─────────────────────────────────────────────────────────────────
# PII Encryption Tests
# ─────────────────────────────────────────────────────────────────

@pytest.fixture
def encryptor():
    return PIIEncryptor()


def test_hash_pii_deterministic(encryptor):
    """Same input = same hash."""
    h1 = encryptor.hash_pii("123456789012")
    h2 = encryptor.hash_pii("123456789012")
    assert h1 == h2


def test_hash_pii_different_inputs(encryptor):
    """Different inputs = different hashes."""
    h1 = encryptor.hash_pii("123456789012")
    h2 = encryptor.hash_pii("987654321098")
    assert h1 != h2


def test_encrypt_decrypt_roundtrip(encryptor):
    """AI-C11 fix: encrypt/decrypt raise NotImplementedError in the gateway —
    PII encryption is the BFF's job (via the Prisma extension). The gateway
    must not write PII to the DB directly. This test verifies the methods
    raise as designed rather than silently degrade to base64 encoding."""
    import pytest as _pytest
    with _pytest.raises(NotImplementedError):
        encryptor.encrypt("123456789012")
    with _pytest.raises(NotImplementedError):
        encryptor.decrypt("enc:v1:fake:fake:fake")


def test_mask_aadhaar(encryptor):
    """Aadhaar = XXXX-XXXX-1234."""
    masked = encryptor.mask_aadhaar("123456789012")
    assert masked == "XXXX-XXXX-9012"
    assert "123456" not in masked


def test_mask_pan(encryptor):
    """PAN = ABCDE1234X → ABCDEXXXXX (last char visible)."""
    masked = encryptor.mask_pan("ABCDE1234F")
    assert "1234" not in masked
    assert masked[9] == "F"  # last char visible


def test_mask_phone(encryptor):
    """Phone = +91-XXXX-XX-1234."""
    masked = encryptor.mask_phone("+919876543210")
    assert "98765" not in masked
    assert "3210" in masked  # last 4 visible


def test_mask_upi(encryptor):
    """UPI = ra***@upi."""
    masked = encryptor.mask_upi("ramesh@upi")
    assert "mesh" not in masked
    assert "@upi" in masked


def test_mask_gstin(encryptor):
    """GSTIN = 27ABCDE*****1Z5."""
    masked = encryptor.mask_gstin("27ABCDE1234F1Z5")
    assert "1234" not in masked
    assert masked.endswith("1Z5")


def test_mask_all_types(encryptor):
    """mask_all should work for all PII types."""
    assert "XXXX" in encryptor.mask_all("aadhaar", "123456789012")
    assert "XXXX" in encryptor.mask_all("pan", "ABCDE1234F")
    assert "XXXX" in encryptor.mask_all("phone", "+919876543210")
    assert "***" in encryptor.mask_all("upi_id", "ramesh@upi")


# ─────────────────────────────────────────────────────────────────
# Auth Middleware Tests
# ─────────────────────────────────────────────────────────────────

@pytest.fixture
def auth():
    return AuthMiddleware()


def test_platinum_can_accept_load(auth):
    """Platinum tier can accept loads."""
    ctx = AuthContext(
        entity_id="test_001", entity_type="driver",
        trust_tier="Platinum", trust_score=850, phone="+919876543210",
    )
    assert auth.can_perform("accept_load", ctx) is True


def test_gold_can_accept_load(auth):
    """Gold tier can accept loads."""
    ctx = AuthContext(
        entity_id="test_002", entity_type="driver",
        trust_tier="Gold", trust_score=650, phone="+919876543210",
    )
    assert auth.can_perform("accept_load", ctx) is True


def test_silver_cannot_accept_load(auth):
    """Silver tier CANNOT accept loads (need Gold)."""
    ctx = AuthContext(
        entity_id="test_003", entity_type="driver",
        trust_tier="Silver", trust_score=500, phone="+919876543210",
    )
    assert auth.can_perform("accept_load", ctx) is False


def test_bronze_cannot_accept_load(auth):
    """Bronze tier CANNOT accept loads."""
    ctx = AuthContext(
        entity_id="test_004", entity_type="driver",
        trust_tier="Bronze", trust_score=300, phone="+919876543210",
    )
    assert auth.can_perform("accept_load", ctx) is False


def test_unverified_cannot_accept_load(auth):
    """Unverified CANNOT accept loads."""
    ctx = AuthContext(
        entity_id="test_005", entity_type="driver",
        trust_tier="Unverified", trust_score=100, phone="+919876543210",
    )
    assert auth.can_perform("accept_load", ctx) is False


def test_unverified_can_browse_loads(auth):
    """Unverified CAN browse loads (anyone can browse)."""
    ctx = AuthContext(
        entity_id="test_006", entity_type="driver",
        trust_tier="Unverified", trust_score=100, phone="+919876543210",
    )
    assert auth.can_perform("browse_loads", ctx) is True


def test_unverified_can_onboard(auth):
    """Unverified CAN onboard."""
    ctx = AuthContext(
        entity_id="test_007", entity_type="driver",
        trust_tier="Unverified", trust_score=0, phone="+919876543210",
    )
    assert auth.can_perform("onboard", ctx) is True


def test_platinum_gets_instant_advance(auth):
    """Only Platinum gets instant advance."""
    platinum_ctx = AuthContext("t1", "driver", "Platinum", 900, "+919876543210")
    gold_ctx = AuthContext("t2", "driver", "Gold", 700, "+919876543210")
    assert auth.can_perform("instant_advance", platinum_ctx) is True
    assert auth.can_perform("instant_advance", gold_ctx) is False


def test_max_active_loads_platinum(auth):
    """Platinum = unlimited loads."""
    assert auth.get_max_active_loads("Platinum") == 999


def test_max_active_loads_gold(auth):
    """Gold = 3 loads."""
    assert auth.get_max_active_loads("Gold") == 3


def test_max_active_loads_silver(auth):
    """Silver = 1 load."""
    assert auth.get_max_active_loads("Silver") == 1


def test_max_active_loads_bronze(auth):
    """Bronze = 0 loads."""
    assert auth.get_max_active_loads("Bronze") == 0


def test_escrow_requirement_platinum(auth):
    """Platinum = 5% escrow."""
    assert auth.get_escrow_requirement_pct("Platinum") == 5.0


def test_escrow_requirement_gold(auth):
    """Gold = 18% escrow."""
    assert auth.get_escrow_requirement_pct("Gold") == 18.0


def test_escrow_requirement_unverified(auth):
    """Unverified = 100% escrow (full prepayment)."""
    assert auth.get_escrow_requirement_pct("Unverified") == 100.0
