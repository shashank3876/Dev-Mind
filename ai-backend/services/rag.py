# RAG service: embeds text with sentence-transformers and stores/queries Qdrant.
import os
from typing import Optional
from sentence_transformers import SentenceTransformer
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import uuid

COLLECTION = "devmind_docs"
VECTOR_SIZE = 384
CHUNK_SIZE = 700
CHUNK_OVERLAP = 100

_model: Optional[SentenceTransformer] = None
_client: Optional[AsyncQdrantClient] = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(
            url=os.environ.get("QDRANT_URL", "http://localhost:6333"),
            api_key=os.environ.get("QDRANT_API_KEY") or None,
        )
    return _client


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


async def ensure_collection():
    client = get_client()
    existing = await client.get_collections()
    names = [c.name for c in existing.collections]
    if COLLECTION not in names:
        await client.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


async def upsert(text: str, metadata: Optional[dict] = None) -> list[str]:
    """Embed and store text chunks; returns list of point IDs."""
    model = get_model()
    client = get_client()
    await ensure_collection()
    chunks = chunk_text(text)
    ids: list[str] = []
    points: list[PointStruct] = []
    for chunk in chunks:
        point_id = str(uuid.uuid4())
        ids.append(point_id)
        vector = model.encode(chunk).tolist()
        points.append(
            PointStruct(
                id=point_id,
                vector=vector,
                payload={"text": chunk, **(metadata or {})},
            )
        )
    if points:
        await client.upsert(COLLECTION, points=points)
    return ids


async def search(query: str, top_k: int = 5) -> list[str]:
    model = get_model()
    vector = model.encode(query).tolist()
    client = get_client()
    await ensure_collection()
    results = await client.query_points(COLLECTION, query=vector, limit=top_k)
    return [hit.payload.get("text", "") for hit in results.points if hit.payload]
