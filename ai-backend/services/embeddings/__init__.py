# Embedding provider package.
import os

from services.embeddings.base import EmbeddingProvider

_DEFAULT = os.environ.get("EMBEDDING_PROVIDER", "local").lower().strip()


def get_embedding_provider(name: str | None = None) -> EmbeddingProvider:
    key = (name or _DEFAULT).lower().strip()
    if key == "vertex":
        from services.embeddings.vertex_provider import get_vertex_embedding_provider

        return get_vertex_embedding_provider()
    if key == "local":
        from services.embeddings.local_provider import get_local_embedding_provider

        return get_local_embedding_provider()
    raise ValueError(f"Unknown embedding provider '{key}'. Supported: local, vertex")
