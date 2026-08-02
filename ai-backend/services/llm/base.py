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
    ) -> AsyncGenerator[str, None]:
        ...

    @abstractmethod
    async def one_shot(self, messages: list[dict], system: str = "") -> str:
        ...
