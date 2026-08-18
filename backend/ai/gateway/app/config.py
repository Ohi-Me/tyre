"""Centralized settings via pydantic-settings (env vars)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TYRE_", extra="ignore")

    # ── LLM providers ───────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    openai_api_key: str = ""
    vllm_base_url: str = ""  # For on-prem GPU inference (optional)

    # ── Voice pipeline ──────────────────────────────────────────────
    whisper_api_key: str = ""        # OpenAI Whisper API (or use local)
    whisper_model: str = "whisper-large-v3"
    elevenlabs_api_key: str = ""
    coqui_model: str = "XTTS-v2"     # Self-hosted Coqui for low-resource langs
    azure_speech_key: str = ""       # Azure Cognitive Services TTS fallback (item #13)
    azure_speech_region: str = "centralindia"

    # ── Translation ─────────────────────────────────────────────────
    nllb_model: str = "facebook/nllb-200-distilled-600M"
    nllb_api_url: str = ""           # Hosted NLLB service (optional)

    # ── Infra ───────────────────────────────────────────────────────
    redis_url: str = "redis://redis:6379"
    qdrant_url: str = "http://qdrant:6333"
    kafka_brokers: str = "kafka:9092"
    database_url: str = ""           # Read-only DSN for ai-gateway

    # ── Web BFF ─────────────────────────────────────────────────────
    web_bff_url: str = ""            # Where to send updates back to Next.js API
    internal_service_token: str = "" # Shared secret for ai-gateway -> BFF service calls

    # ── Razorpay Route (UPI escrow) ───────────────────────────────────
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_route_account_id: str = ""
    razorpay_webhook_secret: str = ""

    # ── WhatsApp (Meta Graph API) ──────────────────────────────────────
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_api_version: str = "v18.0"
    # HMAC secret for verifying Meta's webhook deliveries (X-Hub-Signature-256).
    # Read from env in internal_auth.py via getattr fallback — declared here so
    # settings is the single source of truth for TYRE_* config.
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = ""

    # ── SMS fallback (consignee confirm, WhatsApp-down mitigation) ────
    sms_provider: str = ""           # "msg91" | "twilio" | ""
    sms_api_key: str = ""
    sms_sender_id: str = "TYRE"

    # ── Telegram Bot API (broker / fleet-manager channel) ──────────────
    # Telegram is the broker side of the WhatsApp↔Telegram bridge (Week 1 of the
    # bridge epic). Free, no business verification, simpler webhook model than
    # Meta — see docs/WEBHOOKS.md §3.
    telegram_bot_token: str = ""                 # from @BotFather
    telegram_webhook_secret: str = ""            # secret_token set on setWebhook
    telegram_api_base: str = "https://api.telegram.org"

    # ── Observability ───────────────────────────────────────────────
    otlp_endpoint: str = ""          # OpenTelemetry collector URL
    log_level: str = "info"
    sentry_dsn: str = ""             # Sentry error tracking (item #8). Empty = disabled.
    sentry_traces_sample_rate: float = 0.1
    posthog_api_key: str = ""        # PostHog product analytics (item #8)
    posthog_host: str = "https://app.posthog.com"

    # ── Auth (shared with frontend/web's @tyre/auth/jwt.ts — same HS256 secret) ──
    jwt_access_secret: str = "dev-insecure-secret-change-me"

    # ── Rate limiting (mirrors @tyre/auth/rate-limit.ts tiers) ───────
    rate_limit_standard_per_min: int = 120
    rate_limit_ai_per_min: int = 20

    # ── CORS ────────────────────────────────────────────────────────
    cors_origins: list[str] = ["*"]

    # ── Compliance APIs (region-specific) ──────────────────────────
    gst_verification_api_key: str = ""
    google_maps_api_key: str = ""

    @property
    def llm_provider(self) -> str:
        if self.groq_api_key:
            return "groq"
        if self.openai_api_key:
            return "openai"
        if self.vllm_base_url:
            return "vllm"
        return "none"  # rule-based fallback


settings = Settings()
