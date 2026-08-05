# Abstract LLM provider interface shared by Claude, Gemini, OpenAI, etc.
from abc import ABC, abstractmethod
from typing import AsyncGenerator


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def stream_response(
        self,
        messages: list[dict],
        system: str = "",
        max_output_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        ...

    @abstractmethod
    async def one_shot(
        self,
        messages: list[dict],
        system: str = "",
        max_output_tokens: int = 4096,
    ) -> str:
        ...
