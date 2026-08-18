"""Conversation data models."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ConversationParticipant:
    """A participant in a cross-language conversation."""
    user_id: str
    name: str
    role: str            # driver | broker | shipper | operator
    preferred_locale: str  # BCP-47
    phone: str | None = None
    voice_enabled: bool = False


@dataclass
class ConversationMessage:
    """A single message in a conversation, with all its language variants."""
    id: str
    conversation_id: str
    sender: ConversationParticipant
    original_text: str
    original_locale: str       # BCP-47 detected/spoken
    original_audio_base64: str | None = None  # if voice input

    # Per-recipient localized versions
    translations: dict = field(default_factory=dict)        # {locale: text}
    transliterations: dict = field(default_factory=dict)    # {locale: latin text}
    audio_per_locale: dict = field(default_factory=dict)    # {locale: audio_base64}

    timestamp: str = ""
    intent: str | None = None
    confidence: float = 1.0

    def for_recipient(self, recipient: ConversationParticipant) -> dict:
        """Get the localized version of this message for a specific recipient."""
        locale = recipient.preferred_locale
        return {
            "text": self.translations.get(locale, self.original_text),
            "transliterated": self.transliterations.get(locale),
            "audio_base64": self.audio_per_locale.get(locale) if recipient.voice_enabled else None,
            "original_locale": self.original_locale,
            "sender_locale": self.original_locale,
            "sender_name": self.sender.name,
            "sender_role": self.sender.role,
            "timestamp": self.timestamp,
        }
