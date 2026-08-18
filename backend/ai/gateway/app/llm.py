"""LLM client — picks Groq / OpenAI / vLLM based on settings."""
from __future__ import annotations

from app.config import settings


async def chat_completion(
    system: str, user: str, json_mode: bool = False, temperature: float = 0.4, max_tokens: int = 1024
) -> str:
    """Returns the assistant message content. Raises on failure."""
    provider = settings.llm_provider

    if provider == "groq":
        return await _groq(system, user, json_mode, temperature, max_tokens)
    elif provider == "openai":
        return await _openai(system, user, json_mode, temperature, max_tokens)
    elif provider == "vllm":
        return await _vllm(system, user, temperature, max_tokens)
    else:
        raise RuntimeError("No LLM provider configured — set GROQ_API_KEY or OPENAI_API_KEY")


async def _groq(system: str, user: str, json_mode: bool, temperature: float, max_tokens: int) -> str:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.groq_api_key)
    completion = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"} if json_mode else None,
    )
    return completion.choices[0].message.content or ""


async def _openai(system: str, user: str, json_mode: bool, temperature: float, max_tokens: int) -> str:
    import openai
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    completion = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"} if json_mode else None,
    )
    return completion.choices[0].message.content or ""


async def _vllm(system: str, user: str, temperature: float, max_tokens: int) -> str:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.vllm_base_url}/v1/chat/completions",
            json={
                "model": "Qwen/Qwen2.5-32B-Instruct",
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
