# Vertex AI Gemini LLM provider (uses ADC / Workload Identity, no API key).
import os
from typing import AsyncGenerator, Optional

from google import genai
from google.genai import types

from services.llm.base import LLMProvider

DEFAULT_MODEL = "gemini-2.5-flash"


class VertexProvider(LLMProvider):
    name = "vertex"

    def __init__(self) -> None:
        project = os.environ.get("GCP_PROJECT_ID")
        if not project:
            raise ValueError("GCP_PROJECT_ID is not set")
        location = os.environ.get("GCP_REGION", "us-central1")
        self._client = genai.Client(vertexai=True, project=project, location=location)
        self._model = os.environ.get("VERTEX_MODEL", DEFAULT_MODEL)

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
        max_output_tokens: int = 2048,
    ) -> AsyncGenerator[str, None]:
        config = types.GenerateContentConfig(
            system_instruction=system
            or "You are DevMind, an expert AI code reviewer and developer assistant.",
            max_output_tokens=max_output_tokens,
        )
        stream = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=self._to_contents(messages),
            config=config,
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text

    async def one_shot(
        self,
        messages: list[dict],
        system: str = "",
        max_output_tokens: int = 4096,
    ) -> str:
        config = types.GenerateContentConfig(
            system_instruction=system or "You are DevMind, an expert AI code reviewer.",
            max_output_tokens=max_output_tokens,
            temperature=0.2,
        )
        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=self._to_contents(messages),
            config=config,
        )
        return resp.text or ""


_client: Optional[VertexProvider] = None


def get_vertex_provider() -> VertexProvider:
    global _client
    if _client is None:
        _client = VertexProvider()
    return _client
