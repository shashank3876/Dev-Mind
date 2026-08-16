# Abstract vector store interface.
from abc import ABC, abstractmethod
from typing import Any, Optional


class VectorStore(ABC):
    name: str

    @abstractmethod
    async def ensure_collection(self, vector_size: int) -> None:
        ...

    @abstractmethod
    async def upsert(
        self,
        ids: list[str],
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
    ) -> None:
        ...

    @abstractmethod
    async def search(self, vector: list[float], top_k: int = 5) -> list[str]:
        ...
