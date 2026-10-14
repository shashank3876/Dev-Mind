from services.vectorstore.rank_fusion import reciprocal_rank_fusion, rrf_scores
from services.vectorstore.sparse import text_to_sparse, tokenize


def test_tokenize_basic():
    assert tokenize("FREE_CHAT_LIMIT and webhook_jobs_dlq") == [
        "free_chat_limit",
        "and",
        "webhook_jobs_dlq",
    ]


def test_text_to_sparse_has_indices_for_tokens():
    sparse = text_to_sparse("hybrid RAG uses BM25 and dense vectors")
    assert sparse.indices
    assert len(sparse.indices) == len(sparse.values)
    assert all(v > 0 for v in sparse.values)


def test_text_to_sparse_empty():
    sparse = text_to_sparse("   ")
    assert sparse.indices == []
    assert sparse.values == []


def test_text_to_sparse_repeated_tokens_increase_tf():
    once = text_to_sparse("qdrant")
    twice = text_to_sparse("qdrant qdrant")
    assert once.indices == twice.indices
    assert twice.values[0] > once.values[0]


def test_reciprocal_rank_fusion_prefers_consensus():
    # doc-a ranks high in both lists → should win
    fused = reciprocal_rank_fusion(
        [
            ["a", "b", "c"],
            ["a", "c", "d"],
        ],
        limit=3,
    )
    assert fused[0] == "a"
    assert set(fused) <= {"a", "b", "c", "d"}


def test_rrf_scores_monotonic_with_rank():
    scores = rrf_scores([["first", "second"]])
    assert scores["first"] > scores["second"]
