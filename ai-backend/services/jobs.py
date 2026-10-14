# Shared PR-review job helpers: IDs, idempotency keys, exponential backoff.
from __future__ import annotations

import base64
import json
import random
import uuid
from typing import Any

DEFAULT_MAX_ATTEMPTS = 5
IN_PROCESS_ATTEMPTS = 3
BACKOFF_BASE_SECONDS = 2.0
BACKOFF_CAP_SECONDS = 60.0

JOBS_KEY = "webhook_jobs"
PROCESSING_KEY = "webhook_jobs_processing"
DELAYED_KEY = "webhook_jobs_delayed"
DEAD_LETTER_KEY = "webhook_jobs_dlq"
DELIVERY_PREFIX = "webhook:delivery:"
IDEM_PREFIX = "webhook:idem:"
JOB_HASH_PREFIX = "job:"

STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_RETRYING = "retrying"
STATUS_SUCCEEDED = "succeeded"
STATUS_DEAD_LETTER = "dead_letter"
STATUS_DUPLICATE = "duplicate"


def new_job_id() -> str:
    return str(uuid.uuid4())


def idempotency_key(repo: str, pr_number: int, sha: str) -> str:
    return f"{(repo or '').strip()}#{int(pr_number)}@{(sha or '').strip()}"


def backoff_seconds(
    attempt: int,
    *,
    base: float = BACKOFF_BASE_SECONDS,
    cap: float = BACKOFF_CAP_SECONDS,
    jitter: bool = True,
) -> float:
    """Exponential backoff: 2, 4, 8, ... capped, plus up to 25% jitter."""
    safe_attempt = max(1, int(attempt))
    delay = min(cap, base * (2 ** (safe_attempt - 1)))
    if jitter:
        delay += random.uniform(0, delay * 0.25)
    return delay


def normalize_job(job: dict[str, Any]) -> dict[str, Any]:
    out = dict(job)
    out["id"] = str(out.get("id") or new_job_id())
    out["delivery_id"] = str(out.get("delivery_id") or "")
    out["repo"] = str(out.get("repo") or "")
    out["pr_number"] = int(out.get("pr_number") or 0)
    out["diff_url"] = str(out.get("diff_url") or "")
    out["sha"] = str(out.get("sha") or "")
    out["author"] = str(out.get("author") or "")
    out["branch"] = str(out.get("branch") or "")
    out["event_type"] = str(out.get("event_type") or "pull_request")
    out["attempt"] = int(out.get("attempt") or 0)
    out["max_attempts"] = int(out.get("max_attempts") or DEFAULT_MAX_ATTEMPTS)
    if out["max_attempts"] <= 0:
        out["max_attempts"] = DEFAULT_MAX_ATTEMPTS
    out["idempotency_key"] = str(
        out.get("idempotency_key")
        or (
            idempotency_key(out["repo"], out["pr_number"], out["sha"])
            if out["repo"] and out["pr_number"] and out["sha"]
            else ""
        )
    )
    out["status"] = str(out.get("status") or STATUS_QUEUED)
    out["last_error"] = out.get("last_error")
    return out


def parse_push_payload(body: dict) -> tuple[dict, int]:
    delivery_attempt = int(body.get("deliveryAttempt") or 0)
    message = body.get("message")
    if isinstance(message, dict) and message.get("data"):
        raw = base64.b64decode(message["data"]).decode("utf-8")
        job = json.loads(raw)
        if not isinstance(job, dict):
            raise ValueError("decoded Pub/Sub payload is not a JSON object")
        attrs = message.get("attributes") or {}
        if isinstance(attrs, dict):
            job.setdefault("id", attrs.get("job_id"))
            job.setdefault("delivery_id", attrs.get("delivery_id"))
            job.setdefault("idempotency_key", attrs.get("idempotency_key"))
        return job, delivery_attempt
    if "repo" in body or "pr_number" in body:
        return body, delivery_attempt
    raise ValueError("payload is not a Pub/Sub envelope or Job object")
