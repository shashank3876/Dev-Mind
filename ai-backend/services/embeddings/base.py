# Abstract embedding provider interface.
from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    name: str
    vector_size: int

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        ...

    async def embed_query(self, text: str) -> list[float]:
        vectors = await self.embed([text])
        return vectors[0] if vectors else []
