# Shared types for vector search results.
from typing import TypedDict


class VectorSearchHit(TypedDict, total=False):
    text: str
    source: str
    score: float
