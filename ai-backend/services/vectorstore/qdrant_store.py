# Qdrant vector store implementation.
import os
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from services.secrets import get_secret
from services.vectorstore.base import VectorStore

COLLECTION_LOCAL = "devmind_docs"
COLLECTION_VERTEX = "devmind_docs_vertex"

_client: Optional[AsyncQdrantClient] = None


def get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(
            url=os.environ.get("QDRANT_URL", "http://localhost:6333"),
            api_key=get_secret("QDRANT_API_KEY") or None,
        )
    return _client


def collection_name(embedding_provider: str) -> str:
    return COLLECTION_VERTEX if embedding_provider == "vertex" else COLLECTION_LOCAL


class QdrantVectorStore(VectorStore):
    name = "qdrant"

    def __init__(self, embedding_provider: str = "local") -> None:
        self._collection = collection_name(embedding_provider)

    async def ensure_collection(self, vector_size: int) -> None:
        client = get_client()
        existing = await client.get_collections()
        names = [c.name for c in existing.collections]
        if self._collection not in names:
            await client.create_collection(
                self._collection,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )

    async def upsert(
        self,
        ids: list[str],
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
    ) -> None:
        if not ids:
            return
        client = get_client()
        points = [
            PointStruct(id=point_id, vector=vector, payload=payload)
            for point_id, vector, payload in zip(ids, vectors, payloads)
        ]
        await client.upsert(self._collection, points=points)

    async def search(self, vector: list[float], top_k: int = 5) -> list[str]:
        client = get_client()
        results = await client.query_points(self._collection, query=vector, limit=top_k)
        return [hit.payload.get("text", "") for hit in results.points if hit.payload]


_stores: dict[str, QdrantVectorStore] = {}


def get_qdrant_store(embedding_provider: str = "local") -> QdrantVectorStore:
    if embedding_provider not in _stores:
        _stores[embedding_provider] = QdrantVectorStore(embedding_provider=embedding_provider)
    return _stores[embedding_provider]
