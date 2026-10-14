from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.rag import get_search_mode, search
from services.vectorstore.qdrant_store import (
    DENSE_VECTOR_NAME,
    SPARSE_VECTOR_NAME,
    QdrantVectorStore,
)


def test_get_search_mode_defaults_and_override(monkeypatch):
    monkeypatch.delenv("RAG_SEARCH_MODE", raising=False)
    assert get_search_mode() == "hybrid"
    monkeypatch.setenv("RAG_SEARCH_MODE", "vector")
    assert get_search_mode() == "vector"
    assert get_search_mode("hybrid") == "hybrid"
    assert get_search_mode("nope") == "hybrid"


@pytest.mark.asyncio
async def test_qdrant_hybrid_uses_prefetch_and_rrf():
    store = QdrantVectorStore(embedding_provider="local")
    mock_client = MagicMock()
    mock_results = MagicMock()
    mock_results.points = []
    mock_client.query_points = AsyncMock(return_value=mock_results)

    with patch(
        "services.vectorstore.qdrant_store.get_client", return_value=mock_client
    ):
        await store.search(
            [0.1, 0.2],
            top_k=5,
            query_text="FREE_CHAT_LIMIT quota",
            mode="hybrid",
        )

    kwargs = mock_client.query_points.await_args.kwargs
    fusion = kwargs["query"].fusion
    assert getattr(fusion, "name", str(fusion)).lower() == "rrf"
    assert len(kwargs["prefetch"]) == 2
    assert kwargs["prefetch"][0].using == DENSE_VECTOR_NAME
    assert kwargs["prefetch"][1].using == SPARSE_VECTOR_NAME


@pytest.mark.asyncio
async def test_qdrant_vector_mode_skips_sparse():
    store = QdrantVectorStore(embedding_provider="local")
    mock_client = MagicMock()
    mock_results = MagicMock()
    mock_results.points = []
    mock_client.query_points = AsyncMock(return_value=mock_results)

    with patch(
        "services.vectorstore.qdrant_store.get_client", return_value=mock_client
    ):
        await store.search([0.1], top_k=3, query_text="anything", mode="vector")

    kwargs = mock_client.query_points.await_args.kwargs
    assert kwargs.get("prefetch") is None
    assert kwargs["using"] == DENSE_VECTOR_NAME
    assert kwargs["limit"] == 3


@pytest.mark.asyncio
async def test_rag_search_passes_mode_and_query_text(monkeypatch):
    monkeypatch.setenv("RAG_SEARCH_MODE", "vector")

    embedder = MagicMock()
    embedder.vector_size = 384
    embedder.embed_query = AsyncMock(return_value=[0.5, 0.5])

    store = MagicMock()
    store.ensure_collection = AsyncMock()
    store.search = AsyncMock(return_value=[{"text": "hit", "doc_id": "x"}])

    with (
        patch("services.rag.get_embedding_provider", return_value=embedder),
        patch("services.rag.get_vector_store", return_value=store),
    ):
        hits = await search("what is FREE_CHAT_LIMIT?", top_k=5)

    assert hits[0]["doc_id"] == "x"
    store.search.assert_awaited_once()
    call_kwargs = store.search.await_args.kwargs
    assert call_kwargs["mode"] == "vector"
    assert call_kwargs["query_text"] == "what is FREE_CHAT_LIMIT?"
