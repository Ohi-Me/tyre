"""Voice workflow API router — 6 voice-first workflows + conversation sync."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.ai.conversation import ConversationParticipant, ConversationSyncEngine
from app.voice.workflows import VoiceCommandRequest, VoiceWorkflow, VoiceWorkflowEngine

router = APIRouter()


class VoiceCommandPayload(BaseModel):
    audio_base64: str | None = None
    transcript: str | None = None
    user_id: str = ""
    user_role: str = "driver"
    user_locale: str = "hi"
    region: str = "IN"
    workflow: str | None = None
    load_id: str | None = None
    trip_id: str | None = None
    conversation_id: str | None = None
    return_audio: bool = True


@router.post("/command")
async def voice_command(payload: VoiceCommandPayload):
    """
    Universal voice command endpoint — handles all 6 workflows:
      post_load, search_loads, negotiate, ask_question, manage_fleet, update_status

    If workflow is None, auto-detects from the intent.
    """
    engine = VoiceWorkflowEngine()
    workflow_enum = VoiceWorkflow(payload.workflow) if payload.workflow else None
    request = VoiceCommandRequest(
        audio_base64=payload.audio_base64,
        transcript=payload.transcript,
        user_id=payload.user_id,
        user_role=payload.user_role,
        user_locale=payload.user_locale,
        region=payload.region,
        workflow=workflow_enum,
        load_id=payload.load_id,
        trip_id=payload.trip_id,
        conversation_id=payload.conversation_id,
        return_audio=payload.return_audio,
    )
    response = await engine.execute(request)
    return {
        "success": True,
        "data": {
            "workflow": response.workflow,
            "intent": response.intent,
            "original_text": response.original_text,
            "detected_locale": response.detected_locale,
            "reply_text_localized": response.reply_text_localized,
            "reply_text_english": response.reply_text_english,
            "audio_base64": response.audio_base64,
            "actions_taken": response.actions_taken,
            "entities": response.entities,
            "telemetry": {
                "stt_provider": response.stt_provider,
                "mt_provider": response.mt_provider,
                "tts_provider": response.tts_provider,
                "stt_latency_ms": response.stt_latency_ms,
                "mt_latency_ms": response.mt_latency_ms,
                "agent_latency_ms": response.agent_latency_ms,
                "tts_latency_ms": response.tts_latency_ms,
                "total_latency_ms": response.total_latency_ms,
            },
        },
    }


class ConversationMessagePayload(BaseModel):
    conversation_id: str
    sender_id: str
    sender_name: str
    sender_role: str  # driver | broker | shipper | operator
    sender_locale: str  # BCP-47
    sender_voice_enabled: bool = False
    text: str | None = None
    audio_base64: str | None = None
    recipients: list[dict] = []  # [{user_id, name, role, preferred_locale, voice_enabled}]


@router.post("/conversation/message")
async def conversation_message(payload: ConversationMessagePayload):
    """
    Send a message in a cross-language conversation.
    Each recipient receives the message in their preferred language.

    Example: Driver speaks Angika → broker (Odia) sees Odia, shipper (Kannada) sees Kannada,
    operator (English) sees English. All in real-time, no manual translation.
    """
    engine = ConversationSyncEngine()
    sender = ConversationParticipant(
        user_id=payload.sender_id,
        name=payload.sender_name,
        role=payload.sender_role,
        preferred_locale=payload.sender_locale,
        voice_enabled=payload.sender_voice_enabled,
    )
    recipients = [
        ConversationParticipant(
            user_id=r["user_id"],
            name=r.get("name", ""),
            role=r["role"],
            preferred_locale=r["preferred_locale"],
            voice_enabled=r.get("voice_enabled", False),
        )
        for r in payload.recipients
    ]
    message = await engine.process_message(
        conversation_id=payload.conversation_id,
        sender=sender,
        recipients=recipients,
        text=payload.text,
        audio_base64=payload.audio_base64,
    )
    return {
        "success": True,
        "data": {
            "message_id": message.id,
            "conversation_id": message.conversation_id,
            "original_text": message.original_text,
            "original_locale": message.original_locale,
            "sender": {
                "user_id": message.sender.user_id,
                "name": message.sender.name,
                "role": message.sender.role,
                "preferred_locale": message.sender.preferred_locale,
            },
            "translations": message.translations,
            "transliterations": message.transliterations,
            "audio_per_locale": {k: bool(v) for k, v in message.audio_per_locale.items()},
            "timestamp": message.timestamp,
        },
    }


@router.get("/workflows")
async def list_workflows():
    """List all supported voice workflows."""
    return {
        "workflows": [
            {"id": "post_load", "name": "Post Load by Voice", "description": "Shipper posts a new load by voice"},
            {"id": "search_loads", "name": "Search Loads by Voice", "description": "Driver searches for loads by voice"},
            {"id": "negotiate", "name": "Negotiate by Voice", "description": "Driver or broker negotiates by voice"},
            {"id": "ask_question", "name": "Ask Questions by Voice", "description": "Anyone asks TYRE Copilot a question"},
            {"id": "manage_fleet", "name": "Manage Fleet by Voice", "description": "Fleet manager queries status"},
            {"id": "update_status", "name": "Update Delivery Status by Voice", "description": "Driver updates trip status by voice"},
        ],
        "voice_coverage_target": "95%",
        "supported_locales_count": 50,
    }
