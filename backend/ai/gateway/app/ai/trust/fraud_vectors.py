"""
Fraud Vector Catalog — 20 fraud vectors with defenses.

Per V2 PDF Part 3.5.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FraudVector(str, Enum):
    FAKE_LOADS = "fake_loads"
    FAKE_TRUCK = "fake_truck"
    FAKE_DRIVER = "fake_driver"
    FAKE_DELIVERY = "fake_delivery"
    FAKE_DAMAGE_CLAIM = "fake_damage_claim"
    FAKE_BROKER = "fake_broker"
    FAKE_SHIPPER = "fake_shipper"
    FUEL_THEFT = "fuel_theft"
    CARGO_THEFT = "cargo_theft"
    DOUBLE_INVOICING = "double_invoicing"
    RATE_MANIPULATION = "rate_manipulation"
    PAYMENT_DEFAULT = "payment_default"
    DRIVER_NO_SHOW = "driver_no_show"
    BROKER_CANCELLATION = "broker_cancellation"
    IDENTITY_THEFT = "identity_theft"
    VEHICLE_IMPERSONATION = "vehicle_impersonation"
    INSURANCE_FRAUD = "insurance_fraud"
    GST_FRAUD = "gst_fraud"
    WHATSAPP_SPOOFING = "whatsapp_spoofing"
    COLLUSION = "collusion"


@dataclass
class FraudVectorDef:
    vector: str
    who_commits: str
    tyre_defense: str
    trust_score_penalty: int
    auto_ban: bool


# 20 fraud vectors with defenses (per V2 PDF Part 3.5)
FRAUD_VECTORS = {
    FraudVector.FAKE_LOADS: FraudVectorDef(
        vector="Fake loads (load doesn't exist)",
        who_commits="Broker",
        tyre_defense="Escrow funding required before load appears. GSTIN verification.",
        trust_score_penalty=300, auto_ban=True,
    ),
    FraudVector.FAKE_TRUCK: FraudVectorDef(
        vector="Fake truck (smaller than booked)",
        who_commits="Broker/Driver",
        tyre_defense="7 truck photos + AI validation + OCR plate matching.",
        trust_score_penalty=300, auto_ban=True,
    ),
    FraudVector.FAKE_DRIVER: FraudVectorDef(
        vector="Fake driver (unauthorized person drives)",
        who_commits="Driver",
        tyre_defense="Aadhaar face match + DL verification + random selfie check during transit.",
        trust_score_penalty=200, auto_ban=False,
    ),
    FraudVector.FAKE_DELIVERY: FraudVectorDef(
        vector="Fake delivery (POD forged)",
        who_commits="Driver",
        tyre_defense="e-POD photo + GPS timestamp + consignee WhatsApp confirmation.",
        trust_score_penalty=400, auto_ban=True,
    ),
    FraudVector.FAKE_DAMAGE_CLAIM: FraudVectorDef(
        vector="Fake damage claim (driver sells cargo)",
        who_commits="Driver",
        tyre_defense="Cargo photo at pickup + cargo photo at delivery + GPS route audit.",
        trust_score_penalty=300, auto_ban=True,
    ),
    FraudVector.FAKE_BROKER: FraudVectorDef(
        vector="Fake broker (impersonates real broker)",
        who_commits="Broker",
        tyre_defense="GSTIN + PAN + bank account verification + phone OTP.",
        trust_score_penalty=400, auto_ban=True,
    ),
    FraudVector.FAKE_SHIPPER: FraudVectorDef(
        vector="Fake shipper (load posted, never pays)",
        who_commits="Shipper",
        tyre_defense="Escrow funding required. GSTIN + company registration.",
        trust_score_penalty=400, auto_ban=True,
    ),
    FraudVector.FUEL_THEFT: FraudVectorDef(
        vector="Fuel theft (siphon at night)",
        who_commits="Driver/Third party",
        tyre_defense="IoT fuel sensor (Y2+) + AI anomaly detection.",
        trust_score_penalty=100, auto_ban=False,
    ),
    FraudVector.CARGO_THEFT: FraudVectorDef(
        vector="Cargo theft (mid-transit)",
        who_commits="Driver/Third party",
        tyre_defense="GPS geofence + route deviation alert + cargo photo at pickup.",
        trust_score_penalty=300, auto_ban=True,
    ),
    FraudVector.DOUBLE_INVOICING: FraudVectorDef(
        vector="Double invoicing (broker charges shipper twice)",
        who_commits="Broker",
        tyre_defense="AI invoice audit: shipper dashboard flags duplicate invoices.",
        trust_score_penalty=100, auto_ban=False,
    ),
    FraudVector.RATE_MANIPULATION: FraudVectorDef(
        vector="Rate manipulation (broker quotes below market)",
        who_commits="Broker",
        tyre_defense="Market rate dashboard: shipper sees real-time market rate.",
        trust_score_penalty=50, auto_ban=False,
    ),
    FraudVector.PAYMENT_DEFAULT: FraudVectorDef(
        vector="Payment default (broker doesn't pay driver)",
        who_commits="Broker",
        tyre_defense="Escrow holds funds BEFORE load. Broker can't default.",
        trust_score_penalty=200, auto_ban=False,
    ),
    FraudVector.DRIVER_NO_SHOW: FraudVectorDef(
        vector="Driver no-show (accepts then doesn't show)",
        who_commits="Driver",
        tyre_defense="Trust Score penalty (-30). 3 no-shows = suspension.",
        trust_score_penalty=30, auto_ban=False,
    ),
    FraudVector.BROKER_CANCELLATION: FraudVectorDef(
        vector="Broker cancellation (cancels after driver accepted)",
        who_commits="Broker",
        tyre_defense="Trust Score penalty (-50). Driver gets cancellation fee from escrow.",
        trust_score_penalty=50, auto_ban=False,
    ),
    FraudVector.IDENTITY_THEFT: FraudVectorDef(
        vector="Identity theft (uses someone else's Aadhaar/PAN)",
        who_commits="Driver/Broker",
        tyre_defense="Face match + liveness detection + bank penny-drop.",
        trust_score_penalty=400, auto_ban=True,
    ),
    FraudVector.VEHICLE_IMPERSONATION: FraudVectorDef(
        vector="Vehicle impersonation (uses someone else's truck)",
        who_commits="Driver",
        tyre_defense="RC book + number plate OCR + VAHAN API cross-check.",
        trust_score_penalty=300, auto_ban=True,
    ),
    FraudVector.INSURANCE_FRAUD: FraudVectorDef(
        vector="Insurance fraud (fake insurance claim)",
        who_commits="Driver/Fleet",
        tyre_defense="Insurance API verification + accident photo + police FIR.",
        trust_score_penalty=200, auto_ban=False,
    ),
    FraudVector.GST_FRAUD: FraudVectorDef(
        vector="GST fraud (cancelled GSTIN still used)",
        who_commits="Broker/Shipper",
        tyre_defense="Monthly GSTIN status re-verification. Auto-suspend if cancelled.",
        trust_score_penalty=150, auto_ban=False,
    ),
    FraudVector.WHATSAPP_SPOOFING: FraudVectorDef(
        vector="WhatsApp spoofing (impersonates TYRE on WhatsApp)",
        who_commits="External",
        tyre_defense="Verified WhatsApp Business account (green badge). Official number only.",
        trust_score_penalty=0, auto_ban=True,  # external — not an entity score
    ),
    FraudVector.COLLUSION: FraudVectorDef(
        vector="Collusion (broker + driver collude to cheat shipper)",
        who_commits="Broker+Driver",
        tyre_defense="AI anomaly detection: flags unusual rate patterns + route deviations + repeated pairings.",
        trust_score_penalty=250, auto_ban=False,
    ),
}


class FraudVectorCatalog:
    """Catalog of 20 fraud vectors and their TYRE defenses."""

    def get_all_vectors(self) -> dict[str, FraudVectorDef]:
        """Get all 20 fraud vectors."""
        return {v.value: v_def for v, v_def in FRAUD_VECTORS.items()}

    def get_vector(self, vector: FraudVector) -> FraudVectorDef:
        """Get a specific fraud vector definition."""
        return FRAUD_VECTORS[vector]

    def get_vectors_by_actor(self, who: str) -> list[FraudVectorDef]:
        """Get all fraud vectors committed by a specific actor."""
        return [v for v in FRAUD_VECTORS.values() if who.lower() in v.who_commits.lower()]

    def get_auto_ban_vectors(self) -> list[FraudVectorDef]:
        """Get all fraud vectors that trigger auto-ban."""
        return [v for v in FRAUD_VECTORS.values() if v.auto_ban]

    def get_defense_for_vector(self, vector: FraudVector) -> str:
        """Get the TYRE defense for a specific fraud vector."""
        return FRAUD_VECTORS[vector].tyre_defense

    def get_penalty_for_vector(self, vector: FraudVector) -> int:
        """Get the Trust Score penalty for a fraud vector."""
        return FRAUD_VECTORS[vector].trust_score_penalty

    @property
    def total_vectors(self) -> int:
        """Total number of fraud vectors cataloged."""
        return len(FRAUD_VECTORS)
