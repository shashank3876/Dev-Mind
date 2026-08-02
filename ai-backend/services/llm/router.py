# Resolves an LLM provider name to a concrete provider implementation.
import os

from fastapi import HTTPException

from services.llm.base import LLMProvider

_REGISTRY = ("claude", "gemini", "openai")
DEFAULT_PROVIDER = os.environ.get("DEFAULT_LLM_PROVIDER", "claude")


def list_providers() -> list[str]:
    return list(_REGISTRY)


def _load_provider(name: str) -> LLMProvider:
    if name == "claude":
        from services.llm.claude_provider import get_claude_provider

        return get_claude_provider()
    if name == "gemini":
        from services.llm.gemini_provider import get_gemini_provider

        return get_gemini_provider()
    if name == "openai":
        from services.llm.openai_provider import get_openai_provider

        return get_openai_provider()
    raise HTTPException(
        status_code=400,
        detail=f"Unknown provider '{name}'. Supported: {', '.join(_REGISTRY)}",
    )


def get_provider(name: str | None = None) -> LLMProvider:
    key = (name or DEFAULT_PROVIDER).lower().strip()
    if key not in _REGISTRY:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{key}'. Supported: {', '.join(_REGISTRY)}",
        )
    try:
        return _load_provider(key)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Provider '{key}' is not installed: {e}",
        ) from e
