# /dna/analyze — evidence-backed engineering profile analysis (one-shot JSON).
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from middleware.service_auth import require_service_secret
from models.schemas import DnaAnalyzeRequest, DnaAnalyzeResponse, DnaInsight
from services.dna_prompt import (
    DNA_CATEGORIES,
    DNA_CONFIDENCE,
    DNA_KINDS,
    DNA_SYSTEM,
    build_dna_messages,
    extract_json_object,
)
from services.llm import DEFAULT_PROVIDER, get_provider

router = APIRouter()
logger = logging.getLogger("devmind-api")

MAX_DNA_OUTPUT_TOKENS = 4096


def _normalize_insight(raw: dict[str, Any], valid_ids: set[str]) -> DnaInsight | None:
    category = str(raw.get("category", "")).strip()
    kind = str(raw.get("kind", "")).strip()
    title = str(raw.get("title", "")).strip()
    detail = str(raw.get("detail", "")).strip()
    confidence = str(raw.get("confidence", "")).strip()
    evidence_ids = raw.get("evidenceIds") or raw.get("evidence_ids") or []

    if category not in DNA_CATEGORIES:
        return None
    if kind not in DNA_KINDS:
        return None
    if confidence not in DNA_CONFIDENCE:
        return None
    if not title or not detail:
        return None
    if not isinstance(evidence_ids, list):
        return None

    cleaned_ids = [str(e).strip() for e in evidence_ids if str(e).strip() in valid_ids]
    if not cleaned_ids:
        return None

    return DnaInsight(
        category=category,  # type: ignore[arg-type]
        kind=kind,  # type: ignore[arg-type]
        title=title[:200],
        detail=detail[:2000],
        confidence=confidence,  # type: ignore[arg-type]
        evidenceIds=cleaned_ids,
    )


@router.post(
    "/dna/analyze",
    response_model=DnaAnalyzeResponse,
    dependencies=[Depends(require_service_secret)],
)
async def analyze_dna(req: DnaAnalyzeRequest):
    evidence_items = req.evidence.get("items") if isinstance(req.evidence, dict) else None
    if not isinstance(evidence_items, list) or len(evidence_items) == 0:
        raise HTTPException(status_code=400, detail="evidence.items is required")

    valid_ids: set[str] = set()
    for item in evidence_items:
        if isinstance(item, dict) and item.get("id"):
            valid_ids.add(str(item["id"]))

    if not valid_ids:
        raise HTTPException(status_code=400, detail="evidence items must include id fields")

    provider_name = req.provider.value if req.provider else DEFAULT_PROVIDER
    llm = get_provider(provider_name)
    messages = build_dna_messages(req.evidence)

    try:
        raw_text = await llm.one_shot(
            messages,
            system=DNA_SYSTEM,
            max_output_tokens=MAX_DNA_OUTPUT_TOKENS,
        )
    except Exception as e:
        logger.exception("DNA analyze LLM failed")
        raise HTTPException(status_code=502, detail=f"DNA analysis failed: {e}") from e

    try:
        parsed = extract_json_object(raw_text)
    except Exception as e:
        logger.warning("DNA analyze JSON parse failed: %s", e)
        raise HTTPException(status_code=502, detail="Model returned invalid DNA JSON") from e

    summary = str(parsed.get("summary") or "").strip()
    raw_insights = parsed.get("insights") or []
    if not isinstance(raw_insights, list):
        raw_insights = []

    insights: list[DnaInsight] = []
    for raw in raw_insights:
        if not isinstance(raw, dict):
            continue
        normalized = _normalize_insight(raw, valid_ids)
        if normalized is not None:
            insights.append(normalized)

    return DnaAnalyzeResponse(summary=summary or None, insights=insights)
