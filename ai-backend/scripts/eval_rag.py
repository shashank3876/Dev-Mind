#!/usr/bin/env python3
"""Run hybrid vs vector-only RAG evaluation and print a comparison table.

Usage (from ai-backend/, with Qdrant running and venv active):

  python scripts/eval_rag.py
  python scripts/eval_rag.py --out eval/last_results.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

# Ensure ai-backend is on sys.path when run as a script.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from services import rag  # noqa: E402
from services.rag_eval import (  # noqa: E402
    load_dataset,
    score_question,
    summarize_scores,
)
from services.vectorstore.qdrant_store import (  # noqa: E402
    get_client,
    get_qdrant_store,
    reset_qdrant_stores,
)


EVAL_COLLECTION = "devmind_rag_eval"


async def _prepare_collection(vector_size: int) -> None:
    client = get_client()
    existing = await client.get_collections()
    names = [c.name for c in existing.collections]
    if EVAL_COLLECTION in names:
        await client.delete_collection(EVAL_COLLECTION)

    # Point the singleton store at the eval collection.
    reset_qdrant_stores()
    store = get_qdrant_store(embedding_provider="local")
    store._collection = EVAL_COLLECTION  # noqa: SLF001 — eval isolation
    await store.ensure_collection(vector_size)


async def index_corpus(corpus: list[dict]) -> None:
    from services.embeddings import get_embedding_provider

    embedder = get_embedding_provider()
    await _prepare_collection(embedder.vector_size)
    store = get_qdrant_store(embedding_provider="local")
    store._collection = EVAL_COLLECTION  # noqa: SLF001

    ids: list[str] = []
    texts: list[str] = []
    payloads: list[dict] = []
    for doc in corpus:
        point_id = str(uuid.uuid4())
        ids.append(point_id)
        texts.append(doc["text"])
        payloads.append(
            {
                "text": doc["text"],
                "doc_id": doc["doc_id"],
                "source": doc.get("source", doc["doc_id"]),
            }
        )

    vectors = await embedder.embed(texts)
    await store.upsert(ids, vectors, payloads)


async def run_mode(questions: list[dict], mode: str, top_k: int = 5) -> dict:
    rows: list[dict] = []
    per_question: list[dict] = []
    for q in questions:
        # Force store collection for each search path.
        store = get_qdrant_store(embedding_provider="local")
        store._collection = EVAL_COLLECTION  # noqa: SLF001
        hits = await rag.search(q["question"], top_k=top_k, mode=mode)
        metrics = score_question(
            hits,
            q["relevant_doc_ids"],
            q.get("answer_keywords", []),
            k=top_k,
        )
        rows.append(metrics)
        per_question.append(
            {
                "id": q["id"],
                "question": q["question"],
                "retrieved_doc_ids": [
                    h.get("doc_id") for h in hits if h.get("doc_id")
                ],
                **metrics,
            }
        )
    return {"summary": summarize_scores(rows), "questions": per_question}


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


async def main_async(args: argparse.Namespace) -> int:
    os.environ.setdefault("EMBEDDING_PROVIDER", "local")
    os.environ.setdefault("VECTOR_STORE", "qdrant")

    dataset = load_dataset(Path(args.dataset) if args.dataset else None)
    print(f"Indexing {len(dataset['corpus'])} docs into `{EVAL_COLLECTION}`…")
    await index_corpus(dataset["corpus"])

    print(f"Evaluating {len(dataset['questions'])} questions…")
    vector = await run_mode(dataset["questions"], mode="vector")
    hybrid = await run_mode(dataset["questions"], mode="hybrid")

    results = {
        "dataset_version": dataset.get("version"),
        "collection": EVAL_COLLECTION,
        "n_docs": len(dataset["corpus"]),
        "n_questions": len(dataset["questions"]),
        "vector": vector,
        "hybrid": hybrid,
    }

    v, h = vector["summary"], hybrid["summary"]
    print()
    print("| Metric | Vector-only | Hybrid (dense+BM25 RRF) | Delta |")
    print("|--------|-------------|-------------------------|-------|")
    for key, label in (
        ("recall_at_5", "Recall@5"),
        ("citation_accuracy", "Citation accuracy"),
        ("answer_correctness", "Answer correctness"),
    ):
        delta = h[key] - v[key]
        sign = "+" if delta >= 0 else ""
        print(
            f"| {label} | {_pct(v[key])} | {_pct(h[key])} | {sign}{_pct(delta)} |"
        )

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"\nWrote {out_path}")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate hybrid vs vector RAG")
    parser.add_argument(
        "--dataset",
        default=None,
        help="Path to rag_eval_dataset.json",
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "eval" / "last_results.json"),
        help="Where to write JSON results",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
