from fastapi import APIRouter, Request

from app.voice.pipeline import process_voice

router = APIRouter()


@router.post("/process")
async def voice_process(req: dict, request: Request):
    return await process_voice(req)
