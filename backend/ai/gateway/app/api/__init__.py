"""API routers package."""
from .agents import router as agents_router
from .health import router as health_router
from .i18n import router as i18n_router
from .voice import router as voice_router

__all__ = ["health_router", "voice_router", "agents_router", "i18n_router"]
