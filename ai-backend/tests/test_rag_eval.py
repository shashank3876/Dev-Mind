from services.rag_eval import (
    answer_correctness,
    citation_accuracy,
    load_dataset,
    recall_at_k,
    score_question,
    summarize_scores,
)
from services.vectorstore.types import VectorSearchHit


def test_dataset_size_and_shape():
    data = load_dataset()
    assert len(data["corpus"]) >= 20
    assert 20 <= len(data["questions"]) <= 30
    doc_ids = {d["doc_id"] for d in data["corpus"]}
    for q in data["questions"]:
        assert q["relevant_doc_ids"]
        assert all(doc_id in doc_ids for doc_id in q["relevant_doc_ids"])
        assert q.get("answer_keywords")


def test_recall_at_k():
    assert recall_at_k(["a", "b", "c"], ["a", "d"], k=5) == 0.5
    assert recall_at_k(["a", "b"], ["a", "b"], k=5) == 1.0
    assert recall_at_k([], ["a"], k=5) == 0.0


def test_citation_accuracy():
    assert citation_accuracy(["a", "x", "y"], ["a", "b"], k=5) == 1.0
    assert citation_accuracy(["x", "a", "y"], ["a", "b"], k=5) == 0.5
    assert citation_accuracy(["x", "y"], ["a"], k=5) == 0.0
    assert citation_accuracy([], ["a"], k=5) == 0.0


def test_answer_correctness_keyword_overlap():
    ctx = "CHUNK_SIZE is 700 and CHUNK_OVERLAP is 100 characters."
    assert answer_correctness(ctx, ["700", "100"]) == 1.0
    assert answer_correctness(ctx, ["700", "999"]) == 0.5
    assert answer_correctness(ctx, []) == 0.0


def test_score_question_and_summary():
    hits: list[VectorSearchHit] = [
        {"doc_id": "chunking", "text": "CHUNK_SIZE is 700 with overlap 100"},
        {"doc_id": "other", "text": "unrelated"},
    ]
    metrics = score_question(
        hits,
        relevant_doc_ids=["chunking"],
        answer_keywords=["700", "100"],
        k=5,
    )
    assert metrics["recall_at_5"] == 1.0
    assert metrics["citation_accuracy"] == 1.0  # top-1 is gold
    assert metrics["answer_correctness"] == 1.0

    summary = summarize_scores([metrics, metrics])
    assert summary["recall_at_5"] == 1.0
