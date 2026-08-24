import pytest

from services.rag import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text


def test_chunk_text_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_short():
    text = "hello world"
    assert chunk_text(text) == [text]


def test_chunk_text_exact_size():
    text = "a" * CHUNK_SIZE
    assert chunk_text(text) == [text]


def test_chunk_text_multiple_with_overlap():
    text = "a" * (CHUNK_SIZE + CHUNK_OVERLAP + 10)
    chunks = chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
    assert len(chunks) >= 2
    assert all(len(c) <= CHUNK_SIZE for c in chunks)


def test_chunk_text_overlap_progresses():
    text = "0123456789" * 20
    chunks = chunk_text(text, size=10, overlap=3)
    assert len(chunks) > 1
    # Each chunk after the first should share overlap with previous content.
    assert chunks[0][-3:] in chunks[1]
