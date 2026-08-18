"""
Integration tests for the wedge API endpoints.
Uses FastAPI TestClient to verify routes are registered and respond correctly.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """TestClient with all wedge routes registered."""
    from fastapi import FastAPI

    from app.api.wedge import router as wedge_router

    app = FastAPI()
    app.include_router(wedge_router, prefix="/wedge")
    return TestClient(app)


# ─────────────────────────────────────────────────────────────────
# Route Registration Tests
# ─────────────────────────────────────────────────────────────────

def test_wedge_onboarding_voice_route_registered(client):
    """POST /wedge/onboarding/voice should be registered (405 for GET, 422 for empty POST)."""
    r = client.get("/wedge/onboarding/voice")
    assert r.status_code == 405  # Method Not Allowed (route exists, wrong method)

    r = client.post("/wedge/onboarding/voice", json={})
    assert r.status_code == 422  # Validation error (missing required fields)


def test_wedge_escrow_fund_route_registered(client):
    """POST /wedge/escrow/fund should be registered."""
    r = client.post("/wedge/escrow/fund", json={})
    assert r.status_code == 422


def test_wedge_escrow_advance_route_registered(client):
    """POST /wedge/escrow/advance should be registered."""
    r = client.post("/wedge/escrow/advance", json={})
    assert r.status_code == 422


def test_wedge_escrow_balance_route_registered(client):
    """POST /wedge/escrow/balance should be registered."""
    r = client.post("/wedge/escrow/balance", json={})
    assert r.status_code == 422


def test_wedge_truck_photos_route_registered(client):
    """POST /wedge/verification/truck-photos should be registered."""
    r = client.post("/wedge/verification/truck-photos", json={})
    assert r.status_code == 422


def test_wedge_consignee_request_route_registered(client):
    """POST /wedge/verification/consignee-request should be registered."""
    r = client.post("/wedge/verification/consignee-request", json={})
    assert r.status_code == 422


def test_wedge_returns_find_route_registered(client):
    """POST /wedge/returns/find should be registered."""
    r = client.post("/wedge/returns/find", json={})
    assert r.status_code == 422


def test_wedge_fastag_link_route_registered(client):
    """POST /wedge/fastag/link should be registered."""
    r = client.post("/wedge/fastag/link", json={})
    assert r.status_code == 422


def test_wedge_routing_last_mile_route_registered(client):
    """POST /wedge/routing/last-mile should be registered."""
    r = client.post("/wedge/routing/last-mile", json={})
    assert r.status_code == 422


# ─────────────────────────────────────────────────────────────────
# Functional Tests — verify actual responses
# ─────────────────────────────────────────────────────────────────

def test_escrow_fund_success(client):
    """Broker funds escrow — should return 200 with funded status."""
    r = client.post("/wedge/escrow/fund", json={
        "broker_id": "brk_001",
        "load_id": "load_001",
        "load_amount_inr": 45000,
        "advance_amount_inr": 10000,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["data"]["status"] == "FUNDED"
    assert data["data"]["total_funded_inr"] == 55000


def test_escrow_advance_success(client):
    """Release advance — should return 200 with transfer ref."""
    r = client.post("/wedge/escrow/advance", json={
        "escrow_account_id": "acc_123",
        "driver_phone": "+919876543210",
        "driver_upi_id": "ramesh@upi",
        "load_id": "load_001",
        "advance_amount_inr": 10000,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["data"]["amount_released_inr"] == 10000
    assert "upi_transaction_ref" in data["data"]
    # PMF signal
    assert "target_latency_ms" in data["data"]
    assert data["data"]["target_latency_ms"] == 60000


def test_escrow_balance_success(client):
    """Release balance — should deduct 1% TYRE fee."""
    r = client.post("/wedge/escrow/balance", json={
        "escrow_account_id": "acc_123",
        "driver_phone": "+919876543210",
        "driver_upi_id": "ramesh@upi",
        "trip_id": "trip_001",
        "load_id": "load_001",
        "balance_amount_inr": 45000,
        "trigger": "CONSIGNEE_CONFIRM",
        "trigger_ref": "confirm_abc",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    # 1% of 45000 = 450 fee
    assert data["data"]["tyre_fee_inr"] == 450
    # Driver receives 45000 - 450 = 44550
    assert data["data"]["amount_released_inr"] == 44550


def test_consignee_request_success(client):
    """Send consignee confirmation request via WhatsApp."""
    with patch('app.ai.verification.consignee_confirm.ConsigneeConfirmationService._send_whatsapp_message',
               new_callable=AsyncMock, return_value="wamid.test123"):
        r = client.post("/wedge/verification/consignee-request", json={
            "trip_id": "trip_001",
            "load_id": "TYRE-0001",
            "consignee_name": "Shipper Co",
            "consignee_phone": "+919876543220",
            "consignee_locale": "hi",
            "driver_phone": "+919876543210",
        })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["data"]["status"] == "PENDING"
    assert "confirmation_link" in data["data"]


def test_fastag_toll_estimate_success(client):
    """Get toll estimate for a route."""
    r = client.post("/wedge/fastag/toll-estimate", json={
        "origin": "Patna",
        "destination": "Delhi",
        "vehicle_class": "HMV",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["data"]["origin"] == "Patna"
    assert data["data"]["destination"] == "Delhi"
    assert data["data"]["currency"] == "INR"
    # Honest gap: NHAI/NETC toll-calculator API is Y1 H2 scope — the endpoint reports
    # NOT_INTEGRATED rather than fabricating a toll number.
    assert data["data"]["status"] == "NOT_INTEGRATED"
    assert data["data"]["estimated_toll_inr"] is None


def test_returns_find_with_no_candidates(client):
    """Return-load search with no candidates should return empty proposals + estimated loss."""
    with patch('app.ai.returns.return_load_matcher.ReturnLoadMatcher._query_return_candidates',
               new_callable=AsyncMock, return_value=[]):
        r = client.post("/wedge/returns/find", json={
            "original_load_id": "load_001",
            "original_load_tyre_code": "TYRE-0001",
            "original_origin": "Patna",
            "original_destination": "Delhi",
            "original_rate": 45000,
            "driver_id": "driver_001",
            "driver_phone": "+919876543210",
            "driver_locale": "hi",
            "truck_type": "12-wheeler",
            "expected_delivery_time": "2026-01-15T14:00:00Z",
        })
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["data"]["proposals"] == []
    assert data["data"]["estimated_empty_loss_inr"] == 13500  # 30% of 45000
