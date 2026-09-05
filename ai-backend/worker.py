# Background worker: reviews GitHub PRs from Redis (local) or Pub/Sub push (Cloud Run).
from __future__ import annotations

import asyncio
import json
import os
import signal
import time
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from services.redis_client import create_redis_client, load_env

load_env()

from services.job_store import store
from services.jobs import (
    DEAD_LETTER_KEY,
    DELAYED_KEY,
    IN_PROCESS_ATTEMPTS,
    JOBS_KEY,
    PROCESSING_KEY,
    STATUS_DEAD_LETTER,
    STATUS_DUPLICATE,
    STATUS_RETRYING,
    STATUS_SUCCEEDED,
    backoff_seconds,
    normalize_job,
    parse_push_payload,
)
from services.logging_config import setup_logging
from services.memory import init_db
from services.secrets import load_secrets
from services.llm.router import get_provider
from services import github as gh_service
from services.review_prompt import MAX_OUTPUT_TOKENS, REVIEW_SYSTEM, build_review_messages

logger = setup_logging("devmind-worker")
load_secrets()

shutdown_event = asyncio.Event()
_redis_task: asyncio.Task | None = None


def queue_backend() -> str:
    return os.environ.get("QUEUE_BACKEND", "redis").strip().lower() or "redis"


async def with_retries(label: str, coro_factory, attempts: int = IN_PROCESS_ATTEMPTS):
    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await coro_factory()
        except Exception as e:
            last_err = e
            logger.warning("%s failed (attempt %s/%s): %s", label, attempt, attempts, e)
            if attempt < attempts:
                delay = backoff_seconds(attempt)
                logger.info("%s backing off %.2fs", label, delay)
                await asyncio.sleep(delay)
    raise last_err  # type: ignore[misc]


async def process_job(job: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    job = normalize_job(job)
    outcome, claimed = store.claim(job)
    if outcome == STATUS_DUPLICATE:
        logger.info(
            "skipping duplicate job id=%s key=%s delivery=%s",
            claimed.get("id"),
            claimed.get("idempotency_key"),
            claimed.get("delivery_id"),
        )
        return STATUS_DUPLICATE, claimed

    job = claimed
    diff_url = job.get("diff_url", "")
    repo = job.get("repo", "")
    pr_number = job.get("pr_number", 0)

    if not diff_url or not pr_number:
        logger.warning("skipping job missing diff_url/pr_number: %s", job)
        store.mark(job, STATUS_DEAD_LETTER, error="missing diff_url/pr_number")
        return STATUS_DEAD_LETTER, job

    logger.info(
        "reviewing PR #%s in %s job=%s attempt=%s/%s",
        pr_number,
        repo,
        job["id"],
        job["attempt"] + 1,
        job["max_attempts"],
    )

    try:
        diff = await with_retries("fetch_diff", lambda: gh_service.fetch_diff(diff_url))
        messages = build_review_messages(diff)
        review = await with_retries(
            "llm_review",
            lambda: get_provider(os.environ.get("DEFAULT_LLM_PROVIDER", "claude")).one_shot(
                messages,
                system=REVIEW_SYSTEM,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            ),
        )
        comment = f"## DevMind Code Review\n\n{review}"
        await with_retries(
            "post_comment",
            lambda: gh_service.post_review_comment(repo, pr_number, comment),
        )
    except Exception as e:
        job["attempt"] = int(job.get("attempt") or 0) + 1
        error = str(e)
        if job["attempt"] >= job["max_attempts"]:
            logger.error("moving job %s to DLQ after %s attempts: %s", job["id"], job["attempt"], e)
            store.mark(job, STATUS_DEAD_LETTER, error=error)
            return STATUS_DEAD_LETTER, job
        logger.warning(
            "job %s will retry (%s/%s): %s",
            job["id"],
            job["attempt"],
            job["max_attempts"],
            e,
        )
        store.mark(job, STATUS_RETRYING, error=error)
        return STATUS_RETRYING, job

    store.mark(job, STATUS_SUCCEEDED)
    logger.info("posted review to PR #%s job=%s", pr_number, job["id"])
    return STATUS_SUCCEEDED, job


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _redis_task
    init_db()
    store.init()
    logger.info("worker http listening queue_backend=%s", queue_backend())
    if queue_backend() != "pubsub":
        _redis_task = asyncio.create_task(redis_loop())
    yield
    shutdown_event.set()
    if _redis_task:
        try:
            await asyncio.wait_for(_redis_task, timeout=35)
        except asyncio.TimeoutError:
            logger.warning("redis loop did not stop in time; cancelling")
            _redis_task.cancel()
            try:
                await _redis_task
            except asyncio.CancelledError:
                pass
    logger.info("worker shutdown complete")


app = FastAPI(title="DevMind PR Worker", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "queue_backend": queue_backend(), "shutting_down": shutdown_event.is_set()}


@app.get("/jobs")
async def list_jobs():
    return {"jobs": store.list_jobs()}


@app.get("/jobs/dlq")
async def list_dlq():
    return {"jobs": store.list_dead_letters()}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = store.get(job_id)
    if not job:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return job


@app.post("/pubsub")
async def pubsub_push(request: Request):
    if shutdown_event.is_set():
        return JSONResponse({"status": "shutting_down"}, status_code=503)

    try:
        body = await request.json()
        raw_job, delivery_attempt = parse_push_payload(body)
    except Exception as e:
        logger.error("dropping malformed pubsub payload: %s", e)
        return JSONResponse({"status": "ignored", "reason": "malformed"}, status_code=200)

    job = normalize_job(raw_job)
    if delivery_attempt > 0:
        job["attempt"] = max(int(job.get("attempt") or 0), delivery_attempt - 1)

    result, job = await process_job(job)
    if result in (STATUS_SUCCEEDED, STATUS_DUPLICATE, STATUS_DEAD_LETTER):
        return {"status": result, "job_id": job["id"]}

    # Retryable: non-2xx so Pub/Sub redelivers, then native DLQ after max attempts.
    return JSONResponse(
        {"status": result, "job_id": job["id"]},
        status_code=503,
    )


async def _requeue_inflight(r) -> None:
    moved = 0
    while True:
        raw = await r.rpoplpush(PROCESSING_KEY, JOBS_KEY)
        if raw is None:
            break
        moved += 1
        if moved > 10_000:
            break
    if moved:
        logger.info("requeued %s in-flight jobs after restart", moved)


async def _promote_delayed(r) -> None:
    ready = await r.zrangebyscore(DELAYED_KEY, 0, time.time())
    for raw in ready:
        await r.zrem(DELAYED_KEY, raw)
        await r.lpush(JOBS_KEY, raw)


async def _finish_redis_job(r, raw: str, job: dict[str, Any], result: str) -> None:
    if result == STATUS_RETRYING:
        delay = backoff_seconds(job["attempt"])
        await r.zadd(DELAYED_KEY, {json.dumps(job): time.time() + delay})
        logger.info("job %s delayed %.2fs", job["id"], delay)
    elif result == STATUS_DEAD_LETTER:
        await r.lpush(DEAD_LETTER_KEY, json.dumps(job))
    await r.lrem(PROCESSING_KEY, 1, raw)


async def redis_loop():
    r = await create_redis_client()
    await _requeue_inflight(r)
    logger.info("waiting for redis jobs on %s...", JOBS_KEY)

    while not shutdown_event.is_set():
        try:
            await _promote_delayed(r)
            raw = await r.brpoplpush(JOBS_KEY, PROCESSING_KEY, timeout=1)
            if raw is None:
                continue
            try:
                job = json.loads(raw)
            except json.JSONDecodeError as e:
                logger.error("poison redis payload moved to DLQ: %s", e)
                await r.lpush(DEAD_LETTER_KEY, raw)
                await r.lrem(PROCESSING_KEY, 1, raw)
                continue

            job = normalize_job(job)
            try:
                result, job = await process_job(job)
            except Exception as e:
                logger.error("unexpected process_job error: %s | job=%s", e, job)
                job["attempt"] = int(job.get("attempt") or 0) + 1
                result = STATUS_RETRYING if job["attempt"] < job["max_attempts"] else STATUS_DEAD_LETTER
                store.mark(
                    job,
                    result,
                    error=str(e),
                )
            await _finish_redis_job(r, raw, job, result)
        except Exception as e:
            if shutdown_event.is_set():
                break
            logger.error("worker error: %s", e)
            await asyncio.sleep(1)

    await r.aclose()
    logger.info("redis loop stopped")


def _install_signal_handlers() -> None:
    loop = asyncio.get_event_loop()

    def _request_shutdown() -> None:
        if not shutdown_event.is_set():
            logger.info("received shutdown signal")
            shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_shutdown)
        except NotImplementedError:
            signal.signal(sig, lambda *_: _request_shutdown())


async def redis_main():
    init_db()
    store.init()
    _install_signal_handlers()
    await redis_loop()


if __name__ == "__main__":
    if queue_backend() == "pubsub":
        port = int(os.environ.get("PORT", "8080"))
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        asyncio.run(redis_main())
