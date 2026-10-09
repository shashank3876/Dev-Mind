# Metrics and helpers for hybrid vs vector-only RAG evaluation.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Optional

from services.vectorstore.types import VectorSearchHit

DEFAULT_DATASET = (
    Path(__file__).resolve().parents[1] / "eval" / "rag_eval_dataset.json"
)


def load_dataset(path: Optional[Path] = None) -> dict[str, Any]:
    dataset_path = path or DEFAULT_DATASET
    with dataset_path.open(encoding="utf-8") as f:
        return json.load(f)


def hit_doc_ids(hits: list[VectorSearchHit]) -> list[str]:
    ids: list[str] = []
    for hit in hits:
        doc_id = hit.get("doc_id") or hit.get("source")
        if doc_id:
            ids.append(str(doc_id))
    return ids


def recall_at_k(
    retrieved_doc_ids: Iterable[str],
    relevant_doc_ids: Iterable[str],
    k: int = 5,
) -> float:
    """Recall@k: fraction of gold docs found in the top-k retrieved docs."""
    gold = list(dict.fromkeys(relevant_doc_ids))
    if not gold:
        return 0.0
    top = list(dict.fromkeys(list(retrieved_doc_ids)[:k]))
    hits = sum(1 for doc_id in gold if doc_id in top)
    return hits / len(gold)


def citation_accuracy(
    retrieved_doc_ids: Iterable[str],
    relevant_doc_ids: Iterable[str],
    k: int = 5,
) -> float:
    """Top-1 citation accuracy: 1.0 if the highest-ranked hit is a gold doc.

    Falls back to 0.5 when the gold doc appears later in the top-k (partial credit),
    otherwise 0.0. This rewards ranking quality, not just bag recall.
    """
    gold = set(relevant_doc_ids)
    top = list(dict.fromkeys(list(retrieved_doc_ids)[:k]))
    if not top or not gold:
        return 0.0
    if top[0] in gold:
        return 1.0
    if any(doc_id in gold for doc_id in top):
        return 0.5
    return 0.0


def answer_correctness(
    context_text: str,
    answer_keywords: Iterable[str],
) -> float:
    """Fraction of expected answer keywords present in retrieved context.

    This is a retrieval-grounded proxy for answerability (no LLM judge required).
    """
    keywords = [kw for kw in answer_keywords if kw]
    if not keywords:
        return 0.0
    haystack = context_text.lower()
    matched = sum(1 for kw in keywords if kw.lower() in haystack)
    return matched / len(keywords)


def context_from_hits(hits: list[VectorSearchHit]) -> str:
    return "\n".join(hit.get("text", "") for hit in hits)


def summarize_scores(rows: list[dict[str, float]]) -> dict[str, float]:
    if not rows:
        return {
            "recall_at_5": 0.0,
            "citation_accuracy": 0.0,
            "answer_correctness": 0.0,
        }
    n = len(rows)
    return {
        "recall_at_5": sum(r["recall_at_5"] for r in rows) / n,
        "citation_accuracy": sum(r["citation_accuracy"] for r in rows) / n,
        "answer_correctness": sum(r["answer_correctness"] for r in rows) / n,
    }


def score_question(
    hits: list[VectorSearchHit],
    relevant_doc_ids: list[str],
    answer_keywords: list[str],
    k: int = 5,
) -> dict[str, float]:
    retrieved = hit_doc_ids(hits)
    return {
        "recall_at_5": recall_at_k(retrieved, relevant_doc_ids, k=k),
        "citation_accuracy": citation_accuracy(retrieved, relevant_doc_ids, k=k),
        "answer_correctness": answer_correctness(
            context_from_hits(hits[:k]), answer_keywords
        ),
    }
