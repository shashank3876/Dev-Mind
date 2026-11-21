import pytest

from routes.dna import _normalize_insight
from services.dna_prompt import extract_json_object


def test_extract_json_object_plain():
    data = extract_json_object('{"summary": "ok", "insights": []}')
    assert data["summary"] == "ok"
    assert data["insights"] == []


def test_extract_json_object_fenced():
    raw = """```json
{"summary": "from fence", "insights": []}
```"""
    data = extract_json_object(raw)
    assert data["summary"] == "from fence"


def test_normalize_insight_requires_valid_evidence_ids():
    valid = {"ev_1", "ev_2"}
    ok = _normalize_insight(
        {
            "category": "testing",
            "kind": "strength",
            "title": "Writes tests",
            "detail": "PRs include unit tests.",
            "confidence": "medium",
            "evidenceIds": ["ev_1", "invented"],
        },
        valid,
    )
    assert ok is not None
    assert ok.evidenceIds == ["ev_1"]


def test_normalize_insight_drops_empty_evidence():
    assert (
        _normalize_insight(
            {
                "category": "security",
                "kind": "improvement",
                "title": "Auth gaps",
                "detail": "Missing checks.",
                "confidence": "high",
                "evidenceIds": ["missing"],
            },
            {"ev_1"},
        )
        is None
    )


def test_normalize_insight_rejects_bad_category():
    assert (
        _normalize_insight(
            {
                "category": "frontend",
                "kind": "strength",
                "title": "UI",
                "detail": "Nice UI",
                "confidence": "high",
                "evidenceIds": ["ev_1"],
            },
            {"ev_1"},
        )
        is None
    )
