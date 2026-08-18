# TYRE v3.2 — Test Report

> All 124 tests pass. Tests caught 8 real bugs in the codebase before delivery.

---

## Test Summary

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `test_upi_escrow.py` | 13 | UPI escrow funding, advance release (PMF 60s target), balance release, refunds |
| `test_voice_onboarding.py` | 10 | Voice-first onboarding, Bhojpuri transcript parsing, regex fallback, 2-min target |
| `test_truck_photos.py` | 14 | 7-photo verification, OCR truck number matching, stock image detection, confidence scoring |
| `test_consignee_confirm.py` | 11 | WhatsApp confirmation flow, 5-locale message templates, confirm/reject actions |
| `test_return_load_matcher.py` | 10 | Return-load matching, localized driver messages (hi/bho/en/bn/mr), AI fallback |
| `test_fastag.py` | 9 | FASTag linking, toll processing, toll estimates, dispute filing |
| `test_last_mile.py` | 8 | Last-mile routing, truck restrictions per city, voice navigation generation |
| `test_payment_agent.py` | 11 | Payment agent — UPI only (no stablecoin/Pix/M-Pesa/smart contracts in Y1) |
| `test_orchestrator.py` | 10 | 4 Y1 agents loaded by default, 6 Y2+ deferred, `TYRE_AGENT_TIER=ALL` unlocks all |
| `test_i18n_y1_locales.py` | 10 | 5 Y1-active locales verified (hi, bho, en, bn, mr), Y2/Y3 locales excluded |
| `test_wedge_api.py` | 18 | FastAPI integration — all 11 wedge routes registered + functional |
| **TOTAL** | **124** | **All pass** |

---

## Bugs Caught by Tests

The test suite caught 8 real bugs in the codebase that would have caused runtime failures:

### Bug 1: Missing `resolveSTTLocale` in Python locales
- **Where:** `app/i18n/locales.py`
- **Symptom:** `ImportError: cannot import name 'resolveSTTLocale'`
- **Fix:** Added `resolve_stt_locale()` function + camelCase alias

### Bug 2: Missing `resolveVoiceLocale` alias
- **Where:** `app/i18n/locales.py`
- **Symptom:** `ImportError: cannot import name 'resolveVoiceLocale'`
- **Fix:** Added `resolveVoiceLocale = resolve_voice_locale` alias

### Bug 3: Payment agent still referenced M-Pesa/Pix
- **Where:** `app/agents/payment.py` SYSTEM prompt
- **Symptom:** Test `test_system_prompt_no_pix_mpesa` failed
- **Fix:** Removed all M-Pesa/Pix/bKash references from Y1 prompt (UPI only)

### Bug 4: `verify_truck_onboarding` missing `t0` variable
- **Where:** `app/ai/verification/truck_photos.py`
- **Symptom:** `NameError: name 't0' is not defined`
- **Fix:** Added `t0 = time.monotonic()` at function start

### Bug 5: UPI escrow generated same account ID when called same second
- **Where:** `app/ai/payments/upi_escrow.py`
- **Symptom:** `test_fund_escrow_generates_unique_account_id` failed
- **Fix:** Used `uuid.uuid4().hex[:12]` instead of `int(time.time())`

### Bug 6: Return-load matcher used invalid f-string list comprehension
- **Where:** `app/ai/returns/return_load_matcher.py`
- **Symptom:** `KeyError: 'tyre_code'` (f-string couldn't parse the comprehension)
- **Fix:** Pre-built the candidate summary as JSON before the f-string

### Bug 7: Return-load driver message tried to subtract string from number
- **Where:** `app/ai/returns/return_load_matcher.py`
- **Symptom:** `TypeError: unsupported operand type(s) for -: 'int' and 'str'`
- **Fix:** Removed the `top['total_revenue'] - top['original_load_id']` calculation; show total revenue + TYRE fee instead

### Bug 8: `app/api/__init__.py` didn't export routers
- **Where:** `app/api/__init__.py`
- **Symptom:** `ImportError: cannot import name 'health_router'`
- **Fix:** Added explicit exports for all 4 routers

### Bug 9: `voice/pipeline.py` imported non-existent `get_llm_client`
- **Where:** `app/voice/pipeline.py`
- **Symptom:** `ImportError: cannot import name 'get_llm_client'`
- **Fix:** Removed unused import

### Bug 10: Telemetry hard-required OpenTelemetry (Y2+ dep)
- **Where:** `app/telemetry.py`
- **Symptom:** `ModuleNotFoundError: No module named 'opentelemetry'`
- **Fix:** Made OpenTelemetry optional with graceful degradation; structlog always works

### Bug 11: Return-load no-proposals returned list instead of dict
- **Where:** `app/ai/returns/return_load_matcher.py`
- **Symptom:** `TypeError: list indices must be integers or slices, not str`
- **Fix:** Changed `return [{...}]` to `return {...}`

### Bug 12: Return-load no-proposals message only handled "bho", not "hi"
- **Where:** `app/ai/returns/return_load_matcher.py`
- **Symptom:** Hindi driver got English message instead of Hindi
- **Fix:** Added templates dict for all 5 Y1 locales (hi, bho, bn, mr, en)

---

## How to Run Tests

```bash
cd backend/ai/gateway

# Install minimal Y1 deps
pip install fastapi uvicorn pydantic pydantic-settings httpx groq \
            redis structlog tenacity python-multipart \
            prometheus-fastapi-instrumentator \
            pytest pytest-asyncio

# Run all tests
python -m pytest tests/ -v

# Run with coverage
python -m pytest tests/ --cov=app --cov-report=term-missing

# Run a single test file
python -m pytest tests/test_upi_escrow.py -v

# Run a single test
python -m pytest tests/test_upi_escrow.py::test_release_advance_pmf_latency_target -v
```

---

## Test Categories

### Unit Tests (106 tests)
- `test_upi_escrow.py` — UPI escrow service (PMF 60s target verified)
- `test_voice_onboarding.py` — Voice onboarding (2-min target verified)
- `test_truck_photos.py` — Truck photo verification (7 photos, OCR matching)
- `test_consignee_confirm.py` — WhatsApp consignee confirmation (5 locales)
- `test_return_load_matcher.py` — Return-load matching (5 locales)
- `test_fastag.py` — FASTag wallet integration
- `test_last_mile.py` — Last-mile routing AI
- `test_payment_agent.py` — Payment agent (v3.2 audit: no stablecoins)
- `test_orchestrator.py` — 4 Y1 agents vs 6 Y2+ agents
- `test_i18n_y1_locales.py` — 5 Y1-active locales verified

### Integration Tests (18 tests)
- `test_wedge_api.py` — FastAPI TestClient hits all 11 wedge endpoints

---

## PMF Signal Tests

The test suite explicitly verifies the **60-second advance release PMF signal**:

```python
# tests/test_upi_escrow.py
@pytest.mark.asyncio
async def test_release_advance_pmf_latency_target(service, advance_request):
    """
    PMF SIGNAL: Advance release must complete within 60 seconds.
    This is the wedge metric. If this fails, TYRE has no PMF.
    """
    result = await service.release_advance(advance_request)
    assert result.release_latency_ms < ADVANCE_RELEASE_TARGET_MS, (
        f"PMF FAILURE: advance release took {result.release_latency_ms}ms "
        f"(target <{ADVANCE_RELEASE_TARGET_MS}ms)"
    )
```

If this test fails in production, the PMF signal is broken.

---

## v3.2 Audit Enforcement Tests

The test suite enforces the v3.2 brutal audit decisions:

```python
# tests/test_payment_agent.py
def test_system_prompt_no_stablecoin():
    """v3.2: NO stablecoin references in payment agent."""
    assert "stablecoin" not in SYSTEM.lower()
    assert "crypto" not in SYSTEM.lower()
    assert "USDC" not in SYSTEM
    assert "USDT" not in SYSTEM

def test_system_prompt_no_pix_mpesa():
    """v3.2: NO Pix/M-Pesa references in Y1 (UPI only)."""
    assert "Pix" not in SYSTEM
    assert "M-Pesa" not in SYSTEM
    assert "bKash" not in SYSTEM

def test_system_prompt_no_smart_contracts():
    """v3.2: NO smart contract references."""
    assert "smart contract" not in SYSTEM.lower()
```

If someone re-adds stablecoins or smart contracts to the payment agent, these tests fail.
