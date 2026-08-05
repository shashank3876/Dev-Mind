# OpenAI LLM provider.
import os
from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI

from services.llm.base import LLMProvider

DEFAULT_MODEL = "gpt-4o-mini"


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is not set")
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)

    def _to_messages(self, messages: list[dict], system: str) -> list[dict]:
        out = [{"role": "system", "content": system or "You are DevMind, an expert AI code reviewer and developer assistant."}]
        out.extend({"role": m["role"], "content": m["content"]} for m in messages)
        return out

    async def stream_response(
        self,
        messages: list[dict],
        system: str = "",
        max_output_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=self._to_messages(messages, system),
            max_tokens=max_output_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def one_shot(
        self,
        messages: list[dict],
        system: str = "",
        max_output_tokens: int = 4096,
    ) -> str:
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=self._to_messages(messages, system or "You are DevMind, an expert AI code reviewer."),
            max_tokens=max_output_tokens,
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""


_client: Optional[OpenAIProvider] = None


def get_openai_provider() -> OpenAIProvider:
    global _client
    if _client is None:
        _client = OpenAIProvider()
    return _client
