# Vertex AI text embedding provider.
import asyncio
import os
from typing import Optional

import vertexai
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

from services.embeddings.base import EmbeddingProvider

DEFAULT_MODEL = "text-embedding-004"
VECTOR_SIZE = 768


class VertexEmbeddingProvider(EmbeddingProvider):
    name = "vertex"
    vector_size = VECTOR_SIZE

    def __init__(self) -> None:
        project = os.environ.get("GCP_PROJECT_ID")
        if not project:
            raise ValueError("GCP_PROJECT_ID is not set")
        location = os.environ.get("GCP_REGION", "us-central1")
        vertexai.init(project=project, location=location)
        model_name = os.environ.get("VERTEX_EMBEDDING_MODEL", DEFAULT_MODEL)
        self._model = TextEmbeddingModel.from_pretrained(model_name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        def _encode() -> list[list[float]]:
            inputs = [TextEmbeddingInput(text=t, task_type="RETRIEVAL_DOCUMENT") for t in texts]
            embeddings = self._model.get_embeddings(inputs)
            return [e.values for e in embeddings]

        return await asyncio.to_thread(_encode)

    async def embed_query(self, text: str) -> list[float]:
        if not text:
            return []

        def _encode() -> list[float]:
            inputs = [TextEmbeddingInput(text=text, task_type="RETRIEVAL_QUERY")]
            embeddings = self._model.get_embeddings(inputs)
            return embeddings[0].values if embeddings else []

        return await asyncio.to_thread(_encode)


_provider: Optional[VertexEmbeddingProvider] = None


def get_vertex_embedding_provider() -> VertexEmbeddingProvider:
    global _provider
    if _provider is None:
        _provider = VertexEmbeddingProvider()
    return _provider
