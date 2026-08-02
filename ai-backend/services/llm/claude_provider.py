# Anthropic Claude LLM provider.
import os
from typing import AsyncGenerator, Optional

import anthropic

from services.llm.base import LLMProvider

DEFAULT_MODEL = "claude-sonnet-4-5"


class ClaudeProvider(LLMProvider):
    name = "claude"

    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = os.environ.get("CLAUDE_MODEL", DEFAULT_MODEL)

    async def stream_response(
        self,
        messages: list[dict],
        system: str = "",
    ) -> AsyncGenerator[str, None]:
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=2048,
            system=system or "You are DevMind, an expert AI code reviewer and developer assistant.",
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def one_shot(self, messages: list[dict], system: str = "") -> str:
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=system or "You are DevMind, an expert AI code reviewer.",
            messages=messages,
        )
        return resp.content[0].text


_client: Optional[ClaudeProvider] = None


def get_claude_provider() -> ClaudeProvider:
    global _client
    if _client is None:
        _client = ClaudeProvider()
    return _client
