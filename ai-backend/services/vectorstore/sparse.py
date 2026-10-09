# BM25-style sparse encoding for Qdrant hybrid search.
# Term frequencies are stored as sparse values; Qdrant applies IDF via Modifier.IDF.
from __future__ import annotations

import hashlib
import re
from collections import Counter

from qdrant_client.models import SparseVector

_TOKEN_RE = re.compile(r"[a-z0-9_]+", re.IGNORECASE)
# Large hash space keeps token collisions rare while staying sparse.
SPARSE_DIM = 2**18


def tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _token_index(token: str) -> int:
    digest = hashlib.md5(token.encode("utf-8")).hexdigest()
    return int(digest, 16) % SPARSE_DIM


def text_to_sparse(text: str) -> SparseVector:
    """Convert text into a BM25-ready sparse vector (TF values, IDF on server)."""
    tokens = tokenize(text)
    if not tokens:
        return SparseVector(indices=[], values=[])

    tf = Counter(tokens)
    merged: dict[int, float] = {}
    for token, count in tf.items():
        idx = _token_index(token)
        merged[idx] = merged.get(idx, 0.0) + float(count)

    indices = sorted(merged.keys())
    values = [merged[i] for i in indices]
    return SparseVector(indices=indices, values=values)
