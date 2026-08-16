# RAG service: embeds text and stores/queries vectors via pluggable providers.
import uuid
from typing import Optional

from services.embeddings import get_embedding_provider
from services.vectorstore import get_vector_store

CHUNK_SIZE = 700
CHUNK_OVERLAP = 100


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


async def upsert(text: str, metadata: Optional[dict] = None) -> list[str]:
    """Embed and store text chunks; returns list of point IDs."""
    embedder = get_embedding_provider()
    store = get_vector_store()
    await store.ensure_collection(embedder.vector_size)

    chunks = chunk_text(text)
    ids: list[str] = []
    payloads: list[dict] = []
    for chunk in chunks:
        point_id = str(uuid.uuid4())
        ids.append(point_id)
        payloads.append({"text": chunk, **(metadata or {})})

    vectors = await embedder.embed(chunks)
    await store.upsert(ids, vectors, payloads)
    return ids


async def search(query: str, top_k: int = 5) -> list[str]:
    embedder = get_embedding_provider()
    store = get_vector_store()
    await store.ensure_collection(embedder.vector_size)

    vector = await embedder.embed_query(query)
    if not vector:
        return []
    return await store.search(vector, top_k=top_k)
