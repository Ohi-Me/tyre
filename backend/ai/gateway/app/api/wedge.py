"""
Wedge API router — Y1 wedge-specific endpoints.

These are the only endpoints that matter for the first 90 days.
Other routers (agents, voice, i18n) exist but this is the wedge.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.ai.fastag.service import FastagService
from app.ai.onboarding import VoiceOnboardingService
from app.ai.payments.upi_escrow import (
    AdvanceReleaseRequest,
    BalanceReleaseRequest,
    EscrowFundingRequest,
    UpiEscrowService,
)
from app.ai.returns.return_load_matcher import ReturnLoadMatcher
from app.ai.routing.last_mile import LastMileRouter, LastMileRouteRequest
from app.ai.verification.consignee_confirm import (
    ConsigneeConfirmationRequest,
    ConsigneeConfirmationService,
)
from app.ai.verification.truck_photos import TruckPhotoVerifier
from app.clients import bff_client

router = APIRouter()


# ─────────────────────────────────────────────────────────────────
# Voice Onboarding
# ─────────────────────────────────────────────────────────────────

class VoiceOnboardingPayload(BaseModel):
    audio_base64: str | None = None
    transcript: str | None = None
    driver_phone: str
    driver_locale_hint: str = "hi"


@router.post("/onboarding/voice")
async def voice_onboarding(payload: VoiceOnboardingPayload):
    """
    Onboard a driver from a single voice sample.
    Reduces onboarding from 15 min (typing) to 2 min (voice).
    """
    service = VoiceOnboardingService()
    result = await service.onboard_from_voice(
        audio_base64=payload.audio_base64,
        transcript=payload.transcript,
        driver_phone=payload.driver_phone,
        driver_locale_hint=payload.driver_locale_hint,
    )
    return {
        "success": result.success,
        "data": {
            "onboarding_id": result.onboarding_id,
            "driver_name": result.driver_name,
            "driver_phone": result.driver_phone,
            "driver_locale": result.driver_locale,
            "detected_locale": result.detected_locale,
            "current_location": result.current_location,
            "truck_number": result.truck_number,
            "truck_type": result.truck_type,
            "truck_capacity_tons": result.truck_capacity_tons,
            "next_steps": result.next_steps,
            "voice_confirmation_url": result.voice_confirmation_url,
            "duration_seconds": result.duration_seconds,
        },
    }


# ─────────────────────────────────────────────────────────────────
# UPI Escrow — Fund, Advance, Balance, Refund
# ─────────────────────────────────────────────────────────────────

class EscrowFundingPayload(BaseModel):
    broker_id: str
    load_id: str
    load_amount_inr: float
    advance_amount_inr: float


@router.post("/escrow/fund")
async def fund_escrow(payload: EscrowFundingPayload):
    """
    Broker funds escrow BEFORE load appears on marketplace.
    No funding = no visibility. Eliminates fake loads.
    """
    service = UpiEscrowService()
    result = await service.fund_escrow(EscrowFundingRequest(
        broker_id=payload.broker_id,
        load_id=payload.load_id,
        load_amount_inr=payload.load_amount_inr,
        advance_amount_inr=payload.advance_amount_inr,
    ))
    return {
        "success": result.success,
        "data": {
            "razorpay_account_id": result.razorpay_account_id,
            "total_funded_inr": result.total_funded_inr,
            "advance_amount_inr": result.advance_amount_inr,
            "balance_amount_inr": result.balance_amount_inr,
            "tyre_fee_inr": result.tyre_fee_inr,
            "status": result.status,
            "funding_latency_ms": result.funding_latency_ms,
        },
        "error": result.error,
    }


class AdvanceReleasePayload(BaseModel):
    escrow_account_id: str
    driver_phone: str
    driver_upi_id: str
    load_id: str
    advance_amount_inr: float


@router.post("/escrow/advance")
async def release_advance(payload: AdvanceReleasePayload):
    """
    THE WEDGE: Release ₹10K advance to driver UPI within 60 seconds of load acceptance.
    PMF signal: latency <60s.
    """
    service = UpiEscrowService()
    result = await service.release_advance(AdvanceReleaseRequest(
        escrow_account_id=payload.escrow_account_id,
        driver_phone=payload.driver_phone,
        driver_upi_id=payload.driver_upi_id,
        load_id=payload.load_id,
        advance_amount_inr=payload.advance_amount_inr,
    ))
    return {
        "success": result.success,
        "data": {
            "razorpay_transfer_id": result.razorpay_transfer_id,
            "upi_transaction_ref": result.upi_transaction_ref,
            "amount_released_inr": result.amount_released_inr,
            "release_latency_ms": result.release_latency_ms,
            "target_latency_ms": 60000,
            "target_hit": result.release_latency_ms < 60000,
            "driver_notified": result.driver_notified,
        },
        "error": result.error,
    }


class BalanceReleasePayload(BaseModel):
    escrow_account_id: str
    driver_phone: str
    driver_upi_id: str
    trip_id: str
    load_id: str
    balance_amount_inr: float
    trigger: str  # GPS_POD | CONSIGNEE_CONFIRM | MANUAL
    trigger_ref: str


@router.post("/escrow/balance")
async def release_balance(payload: BalanceReleasePayload):
    """Release balance to driver after GPS-verified POD + consignee confirmation."""
    service = UpiEscrowService()
    result = await service.release_balance(BalanceReleaseRequest(
        escrow_account_id=payload.escrow_account_id,
        driver_phone=payload.driver_phone,
        driver_upi_id=payload.driver_upi_id,
        trip_id=payload.trip_id,
        load_id=payload.load_id,
        balance_amount_inr=payload.balance_amount_inr,
        trigger=payload.trigger,
        trigger_ref=payload.trigger_ref,
    ))
    return {
        "success": result.success,
        "data": {
            "razorpay_transfer_id": result.razorpay_transfer_id,
            "upi_transaction_ref": result.upi_transaction_ref,
            "amount_released_inr": result.amount_released_inr,
            "tyre_fee_inr": result.tyre_fee_inr,
            "release_latency_ms": result.release_latency_ms,
            "driver_notified": result.driver_notified,
            "broker_notified": result.broker_notified,
        },
        "error": result.error,
    }


# ─────────────────────────────────────────────────────────────────
# Truck Photo Verification
# ─────────────────────────────────────────────────────────────────

class TruckPhotoVerifyPayload(BaseModel):
    photos: dict[str, str]  # {photo_type: base64}
    expected_truck_number: str
    driver_phone: str


@router.post("/verification/truck-photos")
async def verify_truck_photos(payload: TruckPhotoVerifyPayload):
    """
    Verify 7 truck photos during onboarding.
    Solves the 'fake truck' problem.
    """
    verifier = TruckPhotoVerifier()
    result = await verifier.verify_truck_onboarding(
        photos=payload.photos,
        expected_truck_number=payload.expected_truck_number,
        driver_phone=payload.driver_phone,
    )
    return {"success": result["success"], "data": result}


# ─────────────────────────────────────────────────────────────────
# Consignee Confirmation
# ─────────────────────────────────────────────────────────────────

class ConsigneeConfirmPayload(BaseModel):
    trip_id: str
    load_id: str
    consignee_name: str
    consignee_phone: str
    consignee_locale: str = "hi"
    driver_phone: str
    driver_photo_url: str | None = None
    driver_gps_lat: float | None = None
    driver_gps_lng: float | None = None


@router.post("/verification/consignee-request")
async def send_consignee_confirmation(payload: ConsigneeConfirmPayload):
    """
    Send WhatsApp confirmation request to consignee at delivery.
    Solves the 'never received' dispute (5-10% of loads).
    """
    service = ConsigneeConfirmationService()
    result = await service.send_confirmation_request(ConsigneeConfirmationRequest(
        trip_id=payload.trip_id,
        load_id=payload.load_id,
        consignee_name=payload.consignee_name,
        consignee_phone=payload.consignee_phone,
        consignee_locale=payload.consignee_locale,
        driver_phone=payload.driver_phone,
        driver_photo_url=payload.driver_photo_url,
        driver_gps_lat=payload.driver_gps_lat,
        driver_gps_lng=payload.driver_gps_lng,
    ))
    return {
        "success": True,
        "data": {
            "confirmation_id": result.confirmation_id,
            "confirmation_link": result.confirmation_link,
            "whatsapp_message_id": result.whatsapp_message_id,
            "status": result.status,
            "expires_at": result.expires_at,
        },
    }


class ConsigneeActionPayload(BaseModel):
    confirmation_id: str
    action: str  # CONFIRM | REJECT


@router.post("/verification/consignee-action")
async def process_consignee_action(payload: ConsigneeActionPayload):
    """Process consignee's confirmation or rejection. Triggers payment release."""
    service = ConsigneeConfirmationService()
    result = await service.process_confirmation(
        confirmation_id=payload.confirmation_id,
        action=payload.action,
    )
    return {"success": True, "data": result}


# ─────────────────────────────────────────────────────────────────
# Return-Load Matching
# ─────────────────────────────────────────────────────────────────

class ReturnLoadMatchPayload(BaseModel):
    original_load_id: str
    original_load_tyre_code: str
    original_origin: str
    original_destination: str
    original_rate: float
    driver_id: str
    driver_phone: str
    driver_locale: str
    truck_type: str
    expected_delivery_time: str


@router.post("/returns/find")
async def find_return_loads(payload: ReturnLoadMatchPayload):
    """
    Find return-load matches for a just-accepted head-haul load.
    Solves #1 fleet problem: 30% empty returns.
    """
    matcher = ReturnLoadMatcher()
    result = await matcher.find_return_loads(
        original_load_id=payload.original_load_id,
        original_load_tyre_code=payload.original_load_tyre_code,
        original_origin=payload.original_origin,
        original_destination=payload.original_destination,
        original_rate=payload.original_rate,
        driver_id=payload.driver_id,
        driver_phone=payload.driver_phone,
        driver_locale=payload.driver_locale,
        truck_type=payload.truck_type,
        expected_delivery_time=payload.expected_delivery_time,
    )
    return {"success": result["success"], "data": result}


# ─────────────────────────────────────────────────────────────────
# FASTag
# ─────────────────────────────────────────────────────────────────

class FastagLinkPayload(BaseModel):
    driver_id: str
    driver_phone: str
    fastag_id: str
    issuer: str
    vehicle_number: str


@router.post("/fastag/link")
async def link_fastag(payload: FastagLinkPayload):
    """Link existing FASTag to TYRE wallet."""
    service = FastagService()
    result = await service.link_fastag(
        driver_id=payload.driver_id,
        driver_phone=payload.driver_phone,
        fastag_id=payload.fastag_id,
        issuer=payload.issuer,
        vehicle_number=payload.vehicle_number,
    )
    return {"success": result["success"], "data": result, "error": result.get("error")}


class TollEstimatePayload(BaseModel):
    origin: str
    destination: str
    vehicle_class: str = "HMV"


@router.post("/fastag/toll-estimate")
async def get_toll_estimate(payload: TollEstimatePayload):
    """Estimate toll cost for a route."""
    service = FastagService()
    result = await service.get_toll_estimate(
        origin=payload.origin,
        destination=payload.destination,
        vehicle_class=payload.vehicle_class,
    )
    return {"success": True, "data": result}


# ─────────────────────────────────────────────────────────────────
# Last-Mile Routing
# ─────────────────────────────────────────────────────────────────

class LastMileRoutePayload(BaseModel):
    trip_id: str
    driver_id: str
    driver_locale: str
    consignee_address: str
    consignee_lat: float
    consignee_lng: float
    truck_type: str
    truck_height_m: float = 4.0
    truck_weight_tons: float = 18.0


@router.post("/routing/last-mile")
async def generate_last_mile_route(payload: LastMileRoutePayload):
    """
    Generate last-mile route with voice navigation in driver's locale.
    Avoids truck-restricted roads.
    """
    router_service = LastMileRouter()
    result = await router_service.generate_route(LastMileRouteRequest(
        trip_id=payload.trip_id,
        driver_id=payload.driver_id,
        driver_locale=payload.driver_locale,
        consignee_address=payload.consignee_address,
        consignee_lat=payload.consignee_lat,
        consignee_lng=payload.consignee_lng,
        truck_type=payload.truck_type,
        truck_height_m=payload.truck_height_m,
        truck_weight_tons=payload.truck_weight_tons,
    ))
    return {"success": result["success"], "data": result}


# ─────────────────────────────────────────────────────────────────
# TYRE Trust Score — THE MOAT
# ─────────────────────────────────────────────────────────────────

class TrustScorePayload(BaseModel):
    entity_id: str
    entity_type: str  # driver | broker | shipper | fleet
    verification_points: int = 0
    transaction_data: dict | None = None
    behavioral_data: dict | None = None
    peer_ratings: list | None = None


@router.post("/trust/score")
async def compute_trust_score(payload: TrustScorePayload):
    """Compute TYRE Trust Score (0-1000) with tier + privileges.

    Phase 0 fix: this endpoint used to compute and return without ever writing to the
    `TrustScore` table — every call recomputed from scratch and a driver's score from
    yesterday was gone. It now persists the computation via the BFF
    (`POST /api/v1/trust/score`, which upserts `TrustScore` and invalidates the cache),
    so this stays the single place a score is computed (`TrustScoreService`), while the
    BFF stays the single place it's written — matching the "Python never writes to
    Postgres directly" rule in `backend/database/prisma/index.ts`.
    """
    from app.ai.trust.trust_score import TrustScoreService
    service = TrustScoreService()
    result = service.compute_score(
        entity_id=payload.entity_id,
        entity_type=payload.entity_type,
        verification_points=payload.verification_points,
        transaction_data=payload.transaction_data or {},
        behavioral_data=payload.behavioral_data or {},
        peer_ratings=payload.peer_ratings or [],
    )

    persisted = await bff_client.persist_trust_score({
        "entity_id": result.entity_id,
        "entity_type": result.entity_type,
        "total_score": result.total_score,
        "verification_score": result.verification_score,
        "transaction_score": result.transaction_score,
        "behavioral_score": result.behavioral_score,
        "peer_rating_score": result.peer_rating_score,
        "tier": result.tier,
        "badge": result.badge,
    })

    return {
        "success": True,
        "data": {
            "entity_id": result.entity_id,
            "entity_type": result.entity_type,
            "total_score": result.total_score,
            "tier": result.tier,
            "badge": result.badge,
            "breakdown": {
                "verification_score": result.verification_score,
                "transaction_score": result.transaction_score,
                "behavioral_score": result.behavioral_score,
                "peer_rating_score": result.peer_rating_score,
            },
            "privileges": result.privileges,
            "computed_at": result.computed_at,
            "persisted": persisted is not None,
        },
    }


class VerifyAadhaarPayload(BaseModel):
    aadhaar_number: str
    phone: str
    name: str


@router.post("/trust/verify/aadhaar")
async def verify_aadhaar(payload: VerifyAadhaarPayload):
    """Verify Aadhaar via UIDAI OTP."""
    from app.ai.trust.verification import VerificationService
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    # Validate input
    aadhaar_val = validator.validate_aadhaar(payload.aadhaar_number)
    if not aadhaar_val.is_valid:
        return {"success": False, "error": aadhaar_val.error}
    service = VerificationService()
    result = await service.verify_aadhaar(aadhaar_val.sanitized_value, payload.phone, payload.name)
    return {
        "success": result.success,
        "data": {
            "verification_type": result.verification_type,
            "score_points": result.score_points,
            "max_points": result.max_points,
            "verified_at": result.verified_at,
            "expires_at": result.expires_at,
            "failure_reason": result.failure_reason,
        },
    }


class VerifyGstinPayload(BaseModel):
    gstin: str


@router.post("/trust/verify/gstin")
async def verify_gstin(payload: VerifyGstinPayload):
    """Verify GSTIN status."""
    from app.ai.trust.verification import VerificationService
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    gstin_val = validator.validate_gstin(payload.gstin)
    if not gstin_val.is_valid:
        return {"success": False, "error": gstin_val.error}
    service = VerificationService()
    result = await service.verify_gstin(gstin_val.sanitized_value)
    return {
        "success": result.success,
        "data": {
            "verification_type": result.verification_type,
            "score_points": result.score_points,
            "max_points": result.max_points,
            "verified_at": result.verified_at,
            "expires_at": result.expires_at,
            "failure_reason": result.failure_reason,
        },
    }


class VerifyBankPayload(BaseModel):
    upi_id: str
    phone: str


@router.post("/trust/verify/bank")
async def verify_bank(payload: VerifyBankPayload):
    """Verify bank account via UPI + penny-drop."""
    from app.ai.trust.verification import VerificationService
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    upi_val = validator.validate_upi_id(payload.upi_id)
    if not upi_val.is_valid:
        return {"success": False, "error": upi_val.error}
    service = VerificationService()
    result = await service.verify_bank(upi_val.sanitized_value, payload.phone)
    return {
        "success": result.success,
        "data": {
            "verification_type": result.verification_type,
            "score_points": result.score_points,
            "max_points": result.max_points,
            "verified_at": result.verified_at,
            "expires_at": result.expires_at,
            "failure_reason": result.failure_reason,
        },
    }


class VerifyVehiclePayload(BaseModel):
    vehicle_number: str
    rc_data: dict = {}


@router.post("/trust/verify/vehicle")
async def verify_vehicle(payload: VerifyVehiclePayload):
    """Verify vehicle via VAHAN API."""
    from app.ai.trust.verification import VerificationService
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    vehicle_val = validator.validate_vehicle_number(payload.vehicle_number)
    if not vehicle_val.is_valid:
        return {"success": False, "error": vehicle_val.error}
    service = VerificationService()
    result = await service.verify_vehicle(vehicle_val.sanitized_value, payload.rc_data)
    return {
        "success": result.success,
        "data": {
            "verification_type": result.verification_type,
            "score_points": result.score_points,
            "max_points": result.max_points,
            "verified_at": result.verified_at,
            "expires_at": result.expires_at,
            "failure_reason": result.failure_reason,
        },
    }


class ApplyPenaltyPayload(BaseModel):
    entity_id: str
    action: str  # one of TrustAction values
    current_score: int
    rater_trust_weight: float = 1.0


@router.post("/trust/penalty")
async def apply_trust_penalty(payload: ApplyPenaltyPayload):
    """Apply a trust penalty or reward to an entity."""
    from app.ai.trust.penalties import PenaltyService, TrustAction
    service = PenaltyService()
    try:
        action = TrustAction(payload.action)
    except ValueError:
        return {"success": False, "error": f"Unknown action: {payload.action}"}
    result = service.apply_action(
        entity_id=payload.entity_id,
        action=action,
        current_score=payload.current_score,
        rater_trust_weight=payload.rater_trust_weight,
    )
    return {
        "success": True,
        "data": {
            "action": result.action,
            "score_change": result.score_change,
            "new_score": result.new_score,
            "new_tier": result.new_tier,
            "auto_ban": result.auto_ban,
            "auto_suspend": result.auto_suspend,
            "auto_review": result.auto_review,
            "consecutive_count": result.consecutive_count,
        },
    }


@router.get("/trust/fraud-vectors")
async def list_fraud_vectors_catalog():
    """List all 20 fraud vectors with TYRE defenses."""
    from app.ai.trust.fraud_vectors import FraudVectorCatalog
    catalog = FraudVectorCatalog()
    return {
        "success": True,
        "data": {
            "total_vectors": catalog.total_vectors,
            "vectors": {
                v: {
                    "vector": d.vector,
                    "who_commits": d.who_commits,
                    "tyre_defense": d.tyre_defense,
                    "trust_score_penalty": d.trust_score_penalty,
                    "auto_ban": d.auto_ban,
                }
                for v, d in catalog.get_all_vectors().items()
            },
        },
    }


# ─────────────────────────────────────────────────────────────────
# WhatsApp Driver Bot — 80% of drivers use WhatsApp
# ─────────────────────────────────────────────────────────────────

class WhatsAppMessagePayload(BaseModel):
    from_phone: str
    message_type: str  # text | voice | image | location
    text_body: str | None = None
    voice_base64: str | None = None
    image_base64: str | None = None
    # Week 3 broadcast: WhatsApp location pin (lat/lng + optional label).
    # Set when a driver shares their location via WhatsApp.
    location_lat: float | None = None
    location_lng: float | None = None
    location_label: str | None = None


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(payload: dict):
    """Meta WhatsApp Cloud API inbound webhook (TYRE v1.1 item #7).

    The BFF (`frontend/web/.../webhooks/whatsapp/route.ts`) handles Meta's GET verification
    handshake and forwards the raw POST envelope here. Meta's envelope is deeply nested:
        entry[].changes[].value.messages[]  with value.contacts[] for the sender.
    We flatten each message into the existing `WhatsAppMessagePayload` shape and run it
    through the same `process_whatsapp_message` handler so the driver bot replies.
    """
    results = []
    try:
        for entry in payload.get("entry", []) or []:
            for change in entry.get("changes", []) or []:
                value = change.get("value", {}) or {}
                messages = value.get("messages", []) or []
                for msg in messages:
                    from_phone = msg.get("from", "")
                    msg_type = msg.get("type", "text")
                    text_body = None
                    location_lat = None
                    location_lng = None
                    location_label = None
                    if msg_type == "text":
                        text_body = (msg.get("text") or {}).get("body")
                    elif msg_type == "button":
                        text_body = (msg.get("button") or {}).get("text")
                    elif msg_type == "interactive":
                        interactive = msg.get("interactive") or {}
                        reply = interactive.get("button_reply") or interactive.get("list_reply") or {}
                        text_body = reply.get("title") or reply.get("id")
                    elif msg_type == "location":
                        # Week 3 broadcast: Meta's location message shape:
                        #   msg.location.latitude / msg.location.longitude
                        #   msg.location.name (optional POI name)
                        #   msg.location.address (optional street address)
                        loc = msg.get("location") or {}
                        try:
                            location_lat = float(loc.get("latitude")) if loc.get("latitude") is not None else None
                            location_lng = float(loc.get("longitude")) if loc.get("longitude") is not None else None
                        except (TypeError, ValueError):
                            location_lat = None
                            location_lng = None
                        label_parts = [p for p in [loc.get("name"), loc.get("address")] if p]
                        location_label = ", ".join(label_parts) if label_parts else None
                    # Voice/image media require a separate media download via the Graph API;
                    # for those we pass the type through with no inline payload for now.
                    mapped_type = "text" if msg_type in ("text", "button", "interactive") else msg_type
                    if not from_phone:
                        continue
                    res = await process_whatsapp_message(WhatsAppMessagePayload(
                        from_phone=from_phone,
                        message_type=mapped_type,
                        text_body=text_body,
                        location_lat=location_lat,
                        location_lng=location_lng,
                        location_label=location_label,
                    ))
                    results.append(res)
        return {"success": True, "processed": len(results), "results": results}
    except Exception as e:  # noqa: BLE001 — webhook must always 200 so Meta doesn't retry-storm
        return {"success": False, "error": str(e), "processed": len(results)}


@router.post("/whatsapp/message")
async def process_whatsapp_message(payload: WhatsAppMessagePayload):
    """
    Process incoming WhatsApp message from driver.
    Routes to: load search, accept, status, rate, emergency, onboarding.
    """
    from app.ai.whatsapp.driver_bot import WhatsAppDriverBot, WhatsAppMessage
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    # Validate phone
    phone_val = validator.validate_phone(payload.from_phone)
    if not phone_val.is_valid:
        return {"success": False, "error": phone_val.error}
    # Validate text if present
    if payload.text_body:
        text_val = validator.validate_text(payload.text_body)
        if not text_val.is_valid:
            return {"success": False, "error": text_val.error}
        payload.text_body = text_val.sanitized_value
    bot = WhatsAppDriverBot()
    message = WhatsAppMessage(
        from_phone=phone_val.sanitized_value,
        message_type=payload.message_type,
        text_body=payload.text_body,
        voice_base64=payload.voice_base64,
        image_base64=payload.image_base64,
        # Week 3 broadcast: pass location pin through so the bot can update
        # Driver.currentLat/Lng via the BFF.
        location_lat=payload.location_lat,
        location_lng=payload.location_lng,
        location_label=payload.location_label,
    )
    reply = await bot.process_incoming_message(message)

    # Phase 0 fix: this used to only return `reply` in the HTTP response without ever
    # sending it back to the driver — the webhook caller (Meta) doesn't read this
    # response body as a message. We now actually send it via the real Graph API client,
    # using interactive buttons when the reply has them.
    from app.ai.whatsapp.graph_client import send_interactive_buttons, send_text_message
    if reply.interactive_buttons:
        send_result = await send_interactive_buttons(reply.to_phone, reply.text, reply.interactive_buttons)
    else:
        send_result = await send_text_message(reply.to_phone, reply.text)

    return {
        "success": True,
        "data": {
            "to_phone": reply.to_phone,
            "text": reply.text,
            "interactive_buttons": reply.interactive_buttons,
            "sent": send_result.get("success", False),
            "whatsapp_message_id": send_result.get("message_id"),
        },
    }


class WhatsAppPaymentConfirmPayload(BaseModel):
    phone: str
    amount_inr: float
    upi_ref: str
    payment_type: str = "advance"


@router.post("/whatsapp/payment-confirm")
async def send_whatsapp_payment_confirmation(payload: WhatsAppPaymentConfirmPayload):
    """Send payment confirmation via WhatsApp push."""
    from app.ai.whatsapp.driver_bot import WhatsAppDriverBot
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    phone_val = validator.validate_phone(payload.phone)
    if not phone_val.is_valid:
        return {"success": False, "error": phone_val.error}
    amount_val = validator.validate_amount_inr(payload.amount_inr)
    if not amount_val.is_valid:
        return {"success": False, "error": amount_val.error}
    bot = WhatsAppDriverBot()
    result = await bot.send_payment_confirmation(
        phone=phone_val.sanitized_value,
        amount_inr=float(amount_val.sanitized_value),
        upi_ref=payload.upi_ref,
        payment_type=payload.payment_type,
    )
    return {"success": result["success"], "data": result}


class WhatsAppReturnLoadPayload(BaseModel):
    phone: str
    return_load_tyre_code: str
    origin: str
    destination: str
    rate_inr: float
    driver_locale: str = "hi"


@router.post("/whatsapp/return-load-suggest")
async def send_whatsapp_return_load_suggestion(payload: WhatsAppReturnLoadPayload):
    """Proactively suggest a return load to a driver via WhatsApp."""
    from app.ai.whatsapp.driver_bot import WhatsAppDriverBot
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    phone_val = validator.validate_phone(payload.phone)
    if not phone_val.is_valid:
        return {"success": False, "error": phone_val.error}
    bot = WhatsAppDriverBot()
    result = await bot.send_return_load_suggestion(
        phone=phone_val.sanitized_value,
        return_load_tyre_code=payload.return_load_tyre_code,
        origin=payload.origin,
        destination=payload.destination,
        rate_inr=payload.rate_inr,
        driver_locale=payload.driver_locale,
    )
    return {"success": result["success"], "data": result}


# ─────────────────────────────────────────────────────────────────
# Telegram broker bot — Week 1 of the WhatsApp↔Telegram bridge
# ─────────────────────────────────────────────────────────────────
#
# Mirrors the WhatsApp webhook pattern: a /wedge/telegram/webhook route that
# the BFF proxies raw Updates to, and a /wedge/telegram/message route for
# direct programmatic sends (used by the bridge agent in Week 2). Plus
# /wedge/telegram/proactive endpoints for load-request and payment-confirm
# pushes, mirroring the WhatsApp /payment-confirm and /return-load-suggest
# endpoints one-for-one so a future bridge agent can treat both channels
# uniformly.


@router.post("/telegram/webhook")
async def telegram_webhook(payload: dict):
    """Telegram Bot API inbound webhook (Week 1 of the WhatsApp↔Telegram bridge).

    The BFF (`frontend/web/.../webhooks/telegram/route.ts`) verifies the
    `X-Telegram-Bot-Api-Secret-Token` header and forwards the raw Update
    here. Telegram's Update is a single object (not a batch like Meta's
    entry[].changes[] envelope), so no flattening is needed — we just hand
    it to the broker bot and send the reply via the bot client.

    Telegram retries failed deliveries, so this webhook must always 200 even
    on internal error — same rule as the WhatsApp webhook.
    """
    try:
        from app.ai.telegram import bot_client
        from app.ai.telegram.broker_bot import TelegramBrokerBot, TelegramUpdate
        bot = TelegramBrokerBot()
        update = TelegramUpdate.from_payload(payload)
        reply = await bot.process_update(update)
        send_result = None
        if reply is not None:
            if reply.inline_keyboard:
                send_result = await bot_client.send_inline_buttons(
                    reply.chat_id, reply.text, reply.inline_keyboard,
                    parse_mode=reply.parse_mode,
                )
            else:
                send_result = await bot_client.send_message(
                    reply.chat_id, reply.text, parse_mode=reply.parse_mode,
                )
        return {
            "success": True,
            "processed": True,
            "update_id": update.update_id,
            "replied": reply is not None,
            "send_result": send_result,
        }
    except Exception as e:  # noqa: BLE001 — webhook must always 200 so Telegram doesn't retry-storm
        return {"success": False, "error": str(e), "processed": False}


class TelegramProactivePayload(BaseModel):
    """Proactive push to a linked broker. Used by the bridge agent (Week 2)
    and by the payment agent's broker notification path."""
    chat_id: str
    text: str


@router.post("/telegram/message")
async def send_telegram_message(payload: TelegramProactivePayload):
    """Send a proactive Telegram message to a chat_id. Authenticated route
    (requires internal-service token) — used by other gateway services when
    they need to push to a broker outside the inbound webhook flow."""
    from app.ai.telegram import bot_client
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    text_val = validator.validate_text(payload.text, max_length=4096)  # Telegram message cap
    if not text_val.is_valid:
        return {"success": False, "error": text_val.error}
    if not payload.chat_id or len(str(payload.chat_id)) > 64:
        return {"success": False, "error": "chat_id required (max 64 chars)"}
    result = await bot_client.send_message(payload.chat_id, text_val.sanitized_value)
    return {"success": result.get("success", False), "data": result}


class TelegramLoadRequestPayload(BaseModel):
    """Push a driver's WhatsApp load request to the linked broker on Telegram.
    Half of the Week 2 bridge — shipped in Week 1 so the proactive send path
    is testable end-to-end."""
    chat_id: str
    driver_name: str
    driver_phone: str
    origin: str
    destination: str
    truck_type: str = ""
    tyre_code: str = ""


@router.post("/telegram/load-request")
async def send_telegram_load_request(payload: TelegramLoadRequestPayload):
    """Push a driver's WhatsApp load request to a broker's Telegram chat."""
    from app.ai.telegram.broker_bot import TelegramBrokerBot
    bot = TelegramBrokerBot()
    result = await bot.send_load_request_to_broker(
        chat_id=payload.chat_id,
        driver_name=payload.driver_name,
        driver_phone=payload.driver_phone,
        origin=payload.origin,
        destination=payload.destination,
        truck_type=payload.truck_type,
        tyre_code=payload.tyre_code,
    )
    return {"success": result["success"], "data": result}


class TelegramPaymentConfirmPayload(BaseModel):
    """Push a UPI payment confirmation to a linked broker. Mirrors the
    WhatsApp /payment-confirm endpoint."""
    chat_id: str
    tyre_code: str
    amount_inr: float
    payment_type: str = "balance"  # advance | balance
    upi_ref: str = ""


@router.post("/telegram/payment-confirm")
async def send_telegram_payment_confirmation(payload: TelegramPaymentConfirmPayload):
    """Push a UPI payment confirmation to a broker via Telegram."""
    from app.ai.telegram.broker_bot import TelegramBrokerBot
    from app.security.input_validation import InputValidator
    validator = InputValidator()
    amount_val = validator.validate_amount_inr(payload.amount_inr)
    if not amount_val.is_valid:
        return {"success": False, "error": amount_val.error}
    if payload.payment_type not in ("advance", "balance"):
        return {"success": False, "error": "payment_type must be 'advance' or 'balance'"}
    bot = TelegramBrokerBot()
    result = await bot.send_payment_confirmation_to_broker(
        chat_id=payload.chat_id,
        tyre_code=payload.tyre_code,
        amount_inr=float(amount_val.sanitized_value),
        payment_type=payload.payment_type,
        upi_ref=payload.upi_ref,
    )
    return {"success": result["success"], "data": result}


# ─────────────────────────────────────────────────────────────────
# Nearby-driver broadcast — Week 3 of the WhatsApp↔Telegram bridge
# ─────────────────────────────────────────────────────────────────
#
# Programmatic broadcast endpoint (used by the dashboard's "Broadcast to nearby
# drivers" button and by future automation). The broker bot's inline Broadcast
# button goes through the bridge agent's _on_broker_broadcast handler, NOT this
# route — this route is for non-Telegram callers (dashboard, API clients).


class BroadcastNearbyDriversPayload(BaseModel):
    """Payload for POST /wedge/broadcast/nearby-drivers.

    Either `tyre_code` (preferred — the service resolves origin GPS + broker
    from the load row) or explicit `origin_lat`/`origin_lng`/`broker_code`
    (for ad-hoc broadcasts not tied to a specific load row)."""
    tyre_code: str | None = None
    broker_code: str | None = None
    origin_lat: float | None = None
    origin_lng: float | None = None
    origin_label: str | None = None
    radius_km: int = 50
    truck_type_filter: str | None = None
    driver_locale: str = "hi"
    initiated_by: str = "api"


@router.post("/broadcast/nearby-drivers")
async def broadcast_to_nearby_drivers(payload: BroadcastNearbyDriversPayload):
    """Programmatic broadcast to nearby drivers.

    Used by the dashboard's "Broadcast to nearby drivers" button and by API
    clients. The broker bot's inline Broadcast button goes through the bridge
    agent instead (which adds the broker Telegram ack), but both paths bottom
    out in the same NearbyDriverBroadcastService.

    Anti-spam is enforced by the BFF: ≤3 broadcasts/load/10min (checked before
    the blast) and ≤5 broadcasts/driver/hour (drivers over the limit are
    filtered out of the nearby query).
    """
    from app.ai.broadcast import BroadcastRequest, NearbyDriverBroadcastService
    from app.clients import bff_client

    # If tyre_code is provided, resolve the load to get origin GPS + broker_code
    origin_lat = payload.origin_lat
    origin_lng = payload.origin_lng
    origin_label = payload.origin_label or "—"
    broker_code = payload.broker_code or ""
    truck_type_filter = payload.truck_type_filter

    if payload.tyre_code:
        load_resp = await bff_client.get_load_by_tyre_code(payload.tyre_code)
        if not load_resp or not load_resp.get("success"):
            return {"success": False, "error": "load_not_found",
                    "message": f"Load {payload.tyre_code} not found"}
        load_data = load_resp.get("data") or {}
        origin_lat = origin_lat if origin_lat is not None else load_data.get("origin_lat")
        origin_lng = origin_lng if origin_lng is not None else load_data.get("origin_lng")
        origin_label = origin_label if payload.origin_label else (load_data.get("origin") or "—")
        broker_code = broker_code or load_data.get("broker_code", "")
        truck_type_filter = truck_type_filter or load_data.get("truck_type_req")

    if origin_lat is None or origin_lng is None:
        return {"success": False, "error": "no_origin_gps",
                "message": "Origin lat/lng required (set on the load row or pass explicitly)"}
    if not broker_code:
        return {"success": False, "error": "no_broker_code",
                "message": "broker_code required (pass explicitly or set tyre_code)"}

    # Anti-spam check (≤3 broadcasts of this load in 10 min)
    if payload.tyre_code and bff_client._configured():
        allowed_resp = await bff_client.check_broadcast_allowed(payload.tyre_code, broker_code)
        if allowed_resp and allowed_resp.get("success"):
            allowed_data = allowed_resp.get("data") or {}
            if not allowed_data.get("allowed"):
                return {
                    "success": False,
                    "error": "rate_limited",
                    "message": allowed_data.get("reason", "too many recent broadcasts"),
                    "recent_count": allowed_data.get("recent_count"),
                    "max": allowed_data.get("max"),
                    "window_min": allowed_data.get("window_min"),
                }

    request = BroadcastRequest(
        tyre_code=payload.tyre_code or f"ADHOC-{int(__import__('time').time())}",
        broker_code=broker_code,
        origin_lat=float(origin_lat),
        origin_lng=float(origin_lng),
        origin_label=origin_label,
        radius_km=payload.radius_km,
        truck_type_filter=truck_type_filter,
        driver_locale=payload.driver_locale,
        initiated_by=payload.initiated_by,
    )
    service = NearbyDriverBroadcastService()
    result = await service.broadcast(request)
    return {
        "success": result.success,
        "data": {
            "tyre_code": result.tyre_code,
            "broker_code": result.broker_code,
            "drivers_found": result.drivers_found,
            "drivers_notified": result.drivers_notified,
            "drivers_failed": result.drivers_failed,
            "broadcast_log_id": result.broadcast_log_id,
            "latency_ms": result.latency_ms,
            "outcomes": [
                {
                    "phone": o.driver_phone,
                    "name": o.driver_name,
                    "distance_km": round(o.distance_km, 2),
                    "status": o.status,
                    "error": o.error,
                }
                for o in result.outcomes
            ],
        },
        "error": result.error,
    }
