# Engineering DNA analysis prompts — evidence-linked insights only.
import json
from typing import Any

DNA_CATEGORIES = (
    "backend",
    "code_quality",
    "system_design",
    "database",
    "testing",
    "security",
    "performance",
    "error_handling",
)

DNA_KINDS = ("strength", "improvement", "pattern", "recommendation")
DNA_CONFIDENCE = ("high", "medium", "low", "insufficient")

DNA_SYSTEM = """You are DevMind, building an evidence-backed engineering profile (Developer DNA).

Rules (strict):
- Use ONLY the evidence items provided. Never invent PRs, commits, repos, or skills.
- Every insight MUST cite one or more evidenceId values that appear in the input.
- If evidence is thin for a category, omit that category or mark confidence "insufficient".
- Do NOT invent numeric skill scores or rankings.
- Recommendations must map to observed improvement areas with the same evidence.
- Prefer recurring patterns across multiple evidence items when possible.
- Output ONLY valid JSON matching the schema. No markdown fences, no commentary.

JSON schema:
{
  "summary": "2-4 sentence overall profile based only on evidence",
  "insights": [
    {
      "category": "backend|code_quality|system_design|database|testing|security|performance|error_handling",
      "kind": "strength|improvement|pattern|recommendation",
      "title": "short title",
      "detail": "1-3 sentences",
      "confidence": "high|medium|low|insufficient",
      "evidenceIds": ["ev_..."]
    }
  ]
}"""


def build_dna_messages(evidence_bundle: dict[str, Any]) -> list[dict[str, str]]:
    payload = json.dumps(evidence_bundle, ensure_ascii=False, indent=2)
    user = (
        "Analyze this developer's public engineering evidence and return the JSON profile.\n\n"
        f"{payload}"
    )
    return [{"role": "user", "content": user}]


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse JSON from model output, tolerating optional markdown fences."""
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty model response")

    if raw.startswith("```"):
        lines = raw.split("\n")
        # drop opening fence
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].lstrip()

    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object in model response")
    return json.loads(raw[start : end + 1])
