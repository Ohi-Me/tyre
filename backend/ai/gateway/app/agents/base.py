"""Base Agent class — common interface + telemetry."""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class AgentResult:
    success: bool
    data: dict[str, Any]
    latency_ms: int
    error: str | None = None


class BaseAgent(ABC):
    """All TYRE agents implement this interface."""

    name: str = "BaseAgent"

    @abstractmethod
    async def run(self, input_data: dict) -> AgentResult:
        ...

    async def safe_run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            return await self.run(input_data)
        except Exception as e:
            return AgentResult(
                success=False, data={}, error=str(e),
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
