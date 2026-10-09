# Qdrant vector store with hybrid dense + BM25 sparse retrieval (RRF fusion).
import logging
import os
from typing import Any, Optional

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    Fusion,
    FusionQuery,
    Modifier,
    PointStruct,
    Prefetch,
    SparseVectorParams,
    VectorParams,
)

from services.secrets import get_secret
from services.vectorstore.base import SearchMode, VectorStore
from services.vectorstore.sparse import text_to_sparse
from services.vectorstore.types import VectorSearchHit

logger = logging.getLogger("devmind-api")

COLLECTION_LOCAL = "devmind_docs"
COLLECTION_VERTEX = "devmind_docs_vertex"

DENSE_VECTOR_NAME = "dense"
SPARSE_VECTOR_NAME = "bm25"

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


def _point_to_hit(point: Any) -> Optional[VectorSearchHit]:
    if not point.payload:
        return None
    hit: VectorSearchHit = {"text": str(point.payload.get("text", ""))}
    if point.id is not None:
        hit["id"] = str(point.id)
    source = point.payload.get("source")
    if source is not None:
        hit["source"] = str(source)
    doc_id = point.payload.get("doc_id")
    if doc_id is not None:
        hit["doc_id"] = str(doc_id)
    if point.score is not None:
        hit["score"] = float(point.score)
    return hit


class QdrantVectorStore(VectorStore):
    name = "qdrant"

    def __init__(self, embedding_provider: str = "local") -> None:
        self._collection = collection_name(embedding_provider)

    async def _collection_is_hybrid(self) -> bool:
        client = get_client()
        try:
            info = await client.get_collection(self._collection)
        except Exception:
            return False
        vectors = info.config.params.vectors
        sparse = info.config.params.sparse_vectors
        if sparse is None or SPARSE_VECTOR_NAME not in sparse:
            return False
        # Named dense vector (dict) vs legacy unnamed VectorParams
        if isinstance(vectors, dict):
            return DENSE_VECTOR_NAME in vectors
        return False

    async def ensure_collection(self, vector_size: int) -> None:
        client = get_client()
        existing = await client.get_collections()
        names = [c.name for c in existing.collections]
        if self._collection in names:
            if await self._collection_is_hybrid():
                return
            logger.warning(
                "Recreating Qdrant collection %s for hybrid dense+BM25 schema "
                "(re-ingest documents after upgrade)",
                self._collection,
            )
            await client.delete_collection(self._collection)

        await client.create_collection(
            self._collection,
            vectors_config={
                DENSE_VECTOR_NAME: VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                )
            },
            sparse_vectors_config={
                SPARSE_VECTOR_NAME: SparseVectorParams(modifier=Modifier.IDF),
            },
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
        points: list[PointStruct] = []
        for point_id, vector, payload in zip(ids, vectors, payloads):
            text = str(payload.get("text", ""))
            points.append(
                PointStruct(
                    id=point_id,
                    vector={
                        DENSE_VECTOR_NAME: vector,
                        SPARSE_VECTOR_NAME: text_to_sparse(text),
                    },
                    payload=payload,
                )
            )
        await client.upsert(self._collection, points=points)

    async def search(
        self,
        vector: list[float],
        top_k: int = 5,
        *,
        query_text: Optional[str] = None,
        mode: SearchMode = "hybrid",
    ) -> list[VectorSearchHit]:
        client = get_client()
        use_hybrid = mode == "hybrid" and bool(query_text and query_text.strip())

        if use_hybrid:
            prefetch_limit = max(top_k * 2, top_k)
            results = await client.query_points(
                self._collection,
                prefetch=[
                    Prefetch(
                        query=vector,
                        using=DENSE_VECTOR_NAME,
                        limit=prefetch_limit,
                    ),
                    Prefetch(
                        query=text_to_sparse(query_text or ""),
                        using=SPARSE_VECTOR_NAME,
                        limit=prefetch_limit,
                    ),
                ],
                query=FusionQuery(fusion=Fusion.RRF),
                limit=top_k,
            )
        else:
            results = await client.query_points(
                self._collection,
                query=vector,
                using=DENSE_VECTOR_NAME,
                limit=top_k,
            )

        hits: list[VectorSearchHit] = []
        for point in results.points:
            hit = _point_to_hit(point)
            if hit is not None:
                hits.append(hit)
        return hits


_stores: dict[str, QdrantVectorStore] = {}


def get_qdrant_store(embedding_provider: str = "local") -> QdrantVectorStore:
    if embedding_provider not in _stores:
        _stores[embedding_provider] = QdrantVectorStore(
            embedding_provider=embedding_provider
        )
    return _stores[embedding_provider]


def reset_qdrant_stores() -> None:
    """Test helper: clear cached store instances."""
    _stores.clear()
