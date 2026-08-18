from fastapi import APIRouter, Request

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


@router.get("/ready")
async def ready(request: Request):
    orch = request.app.state.orchestrator
    return {
        "status": "ready",
        "agents": list(orch.agents.keys()),
        # Was `__import__("app.config").settings` — __import__ returns the top-level
        # `app` package, not the submodule, so `.settings` raised AttributeError.
        "providers": {"groq": bool(settings.groq_api_key)},
    }
