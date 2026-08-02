# Backward-compatible shim — delegates to the Claude LLM provider.
from typing import AsyncGenerator

from services.llm.claude_provider import get_claude_provider


async def stream_response(
    messages: list[dict],
    system: str = "You are DevMind, an expert AI code reviewer and developer assistant.",
) -> AsyncGenerator[str, None]:
    async for token in get_claude_provider().stream_response(messages, system=system):
        yield token


async def one_shot(messages: list[dict], system: str = "") -> str:
    return await get_claude_provider().one_shot(messages, system=system)
