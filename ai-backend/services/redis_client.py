# Redis client helpers for the Python worker and scripts.
import os
from pathlib import Path

import redis.asyncio as aioredis
from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    load_dotenv(_REPO_ROOT / ".env")
    load_dotenv()


def normalize_redis_url(raw: str | None = None) -> str:
    """Accept host:port (Go gateway style) or redis:// URLs."""
    value = (raw or os.environ.get("REDIS_URL") or "redis://localhost:6379").strip()
    if value.startswith(("redis://", "rediss://", "unix://")):
        return value
    return f"redis://{value}"


async def create_redis_client() -> aioredis.Redis:
    return aioredis.from_url(
        normalize_redis_url(),
        decode_responses=True,
        # redis-py 8 defaults socket_timeout=5, which breaks blocking BRPOP.
        socket_timeout=None,
    )
