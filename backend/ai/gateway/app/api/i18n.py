from fastapi import APIRouter

from app.i18n.locales import LOCALES
from app.i18n.translation import translate_batch

router = APIRouter()


@router.get("/locales")
async def list_locales():
    return {"count": len(LOCALES), "locales": [l.__dict__ for l in LOCALES]}


@router.post("/translate")
async def translate(req: dict):
    texts = req["texts"]
    source = req["source_lang"]
    target = req["target_lang"]
    translated = await translate_batch(texts, source, target)
    return {"translations": translated}


@router.post("/detect")
async def detect(req: dict):
    # Placeholder — wire to fastText or langdetect
    text = req.get("text", "")
    return {"language": "hi", "confidence": 0.9}
