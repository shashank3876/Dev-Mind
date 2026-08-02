# Google Gemini LLM provider.
import os
from typing import AsyncGenerator, Optional

from google import genai
from google.genai import types

from services.llm.base import LLMProvider

DEFAULT_MODEL = "gemini-3.6-flash"


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self) -> None:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set")
        self._client = genai.Client(api_key=api_key)
        self._model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)

    def _to_contents(self, messages: list[dict]) -> list[types.Content]:
        contents: list[types.Content] = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
            )
        return contents

    async def stream_response(
        self,
        messages: list[dict],
        system: str = "",
    ) -> AsyncGenerator[str, None]:
        config = types.GenerateContentConfig(
            system_instruction=system or "You are DevMind, an expert AI code reviewer and developer assistant.",
            max_output_tokens=2048,
        )
        stream = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=self._to_contents(messages),
            config=config,
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text

    async def one_shot(self, messages: list[dict], system: str = "") -> str:
        config = types.GenerateContentConfig(
            system_instruction=system or "You are DevMind, an expert AI code reviewer.",
            max_output_tokens=4096,
        )
        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=self._to_contents(messages),
            config=config,
        )
        return resp.text or ""


_client: Optional[GeminiProvider] = None


def get_gemini_provider() -> GeminiProvider:
    global _client
    if _client is None:
        _client = GeminiProvider()
    return _client
