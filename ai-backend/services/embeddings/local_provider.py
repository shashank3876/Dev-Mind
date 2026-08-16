# Local sentence-transformers embedding provider.
import asyncio
from typing import Optional

from sentence_transformers import SentenceTransformer

from services.embeddings.base import EmbeddingProvider

MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_SIZE = 384

_model: Optional[SentenceTransformer] = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


class LocalEmbeddingProvider(EmbeddingProvider):
    name = "local"
    vector_size = VECTOR_SIZE

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        def _encode() -> list[list[float]]:
            vectors = _get_model().encode(texts)
            return [v.tolist() for v in vectors]

        return await asyncio.to_thread(_encode)


_provider: Optional[LocalEmbeddingProvider] = None


def get_local_embedding_provider() -> LocalEmbeddingProvider:
    global _provider
    if _provider is None:
        _provider = LocalEmbeddingProvider()
    return _provider
