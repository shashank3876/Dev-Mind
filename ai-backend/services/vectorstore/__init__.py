# Vector store provider package.
import os

from services.embeddings import get_embedding_provider
from services.vectorstore.base import VectorStore

_DEFAULT = os.environ.get("VECTOR_STORE", "qdrant").lower().strip()


def get_vector_store(name: str | None = None) -> VectorStore:
    key = (name or _DEFAULT).lower().strip()
    embedding_name = get_embedding_provider().name

    if key == "vertex":
        from services.vectorstore.vertex_store import get_vertex_vector_store

        return get_vertex_vector_store()
    if key == "qdrant":
        from services.vectorstore.qdrant_store import get_qdrant_store

        return get_qdrant_store(embedding_provider=embedding_name)
    raise ValueError(f"Unknown vector store '{key}'. Supported: qdrant, vertex")
