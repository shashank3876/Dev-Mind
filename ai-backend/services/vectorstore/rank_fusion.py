# Reciprocal Rank Fusion (RRF) for combining ranked retrieval lists.
from __future__ import annotations

from typing import TypeVar

T = TypeVar("T")


def reciprocal_rank_fusion(
    rankings: list[list[T]],
    *,
    k: int = 60,
    limit: int | None = None,
) -> list[T]:
    """Fuse multiple ranked lists with Reciprocal Rank Fusion.

    score(d) = Σ 1 / (k + rank_i(d)) across lists where d appears.
    """
    scores: dict[T, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank + 1)

    ordered = sorted(scores.keys(), key=lambda item: scores[item], reverse=True)
    if limit is not None:
        return ordered[:limit]
    return ordered


def rrf_scores(
    rankings: list[list[T]],
    *,
    k: int = 60,
) -> dict[T, float]:
    """Return raw RRF scores keyed by item."""
    scores: dict[T, float] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking):
            scores[item] = scores.get(item, 0.0) + 1.0 / (k + rank + 1)
    return scores
