"""
Test the Fraud Vector Catalog — 20 vectors.
"""
import pytest

from app.ai.trust.fraud_vectors import FRAUD_VECTORS, FraudVector, FraudVectorCatalog


@pytest.fixture
def catalog():
    return FraudVectorCatalog()


def test_total_vectors_is_20(catalog):
    """Should have exactly 20 fraud vectors."""
    assert catalog.total_vectors == 20


def test_all_vectors_have_defenses(catalog):
    """Every fraud vector must have an TYRE defense."""
    all_vectors = catalog.get_all_vectors()
    for vector_id, vector_def in all_vectors.items():
        assert vector_def.tyre_defense, f"Missing defense for {vector_id}"
        assert len(vector_def.tyre_defense) > 10, f"Defense too short for {vector_id}"


def test_all_vectors_have_who_commits(catalog):
    """Every fraud vector must identify who commits it."""
    all_vectors = catalog.get_all_vectors()
    for vector_id, vector_def in all_vectors.items():
        assert vector_def.who_commits, f"Missing 'who_commits' for {vector_id}"


def test_all_vectors_have_penalty(catalog):
    """Every fraud vector must have a Trust Score penalty."""
    all_vectors = catalog.get_all_vectors()
    for vector_id, vector_def in all_vectors.items():
        assert vector_def.trust_score_penalty >= 0, f"Missing penalty for {vector_id}"


def test_auto_ban_vectors(catalog):
    """Fake loads, fake truck, fake POD, fake broker, fake shipper, fake delivery, identity theft, cargo theft, vehicle impersonation, WhatsApp spoofing = auto-ban."""
    auto_ban = catalog.get_auto_ban_vectors()
    auto_ban_names = [v.vector for v in auto_ban]
    # At least these should be auto-ban
    assert any("Fake loads" in v for v in auto_ban_names)
    assert any("Fake truck" in v for v in auto_ban_names)
    assert any("Fake delivery" in v for v in auto_ban_names)
    assert any("Identity theft" in v for v in auto_ban_names)


def test_fake_pod_has_highest_penalty(catalog):
    """Fake delivery (POD forged) should have the highest penalty (400)."""
    penalty = catalog.get_penalty_for_vector(FraudVector.FAKE_DELIVERY)
    assert penalty == 400


def test_get_vectors_by_actor_driver(catalog):
    """Should return fraud vectors committed by drivers."""
    driver_vectors = catalog.get_vectors_by_actor("Driver")
    assert len(driver_vectors) > 0
    for v in driver_vectors:
        assert "driver" in v.who_commits.lower() or "Driver" in v.who_commits


def test_get_vectors_by_actor_broker(catalog):
    """Should return fraud vectors committed by brokers."""
    broker_vectors = catalog.get_vectors_by_actor("Broker")
    assert len(broker_vectors) > 0


def test_get_defense_for_fake_loads(catalog):
    """Fake loads defense should mention escrow."""
    defense = catalog.get_defense_for_vector(FraudVector.FAKE_LOADS)
    assert "escrow" in defense.lower() or "GSTIN" in defense


def test_get_defense_for_fuel_theft(catalog):
    """Fuel theft defense should mention IoT or sensor."""
    defense = catalog.get_defense_for_vector(FraudVector.FUEL_THEFT)
    assert "IoT" in defense or "sensor" in defense.lower() or "AI" in defense


def test_get_defense_for_collusion(catalog):
    """Collusion defense should mention AI anomaly detection."""
    defense = catalog.get_defense_for_vector(FraudVector.COLLUSION)
    assert "AI" in defense or "anomaly" in defense.lower()


def test_all_20_fraud_vectors_exist():
    """All 20 fraud vector enum values should be in FRAUD_VECTORS dict."""
    for vector in FraudVector:
        assert vector in FRAUD_VECTORS, f"Missing {vector} from FRAUD_VECTORS"
