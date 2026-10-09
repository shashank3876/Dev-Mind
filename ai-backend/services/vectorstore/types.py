# Shared types for vector search results.
from typing import TypedDict


class VectorSearchHit(TypedDict, total=False):
    id: str
    text: str
    source: str
    doc_id: str
    score: float
