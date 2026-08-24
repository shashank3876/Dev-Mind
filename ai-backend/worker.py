# Background worker: reviews GitHub PRs from Redis (local) or Pub/Sub push (Cloud Run).
import asyncio
import base64
import json
import os

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from services.redis_client import create_redis_client, load_env

load_env()

from services.logging_config import setup_logging
from services.memory import init_db
from services.secrets import load_secrets
from services.llm.router import get_provider
from services import github as gh_service
from services.review_prompt import MAX_OUTPUT_TOKENS, REVIEW_SYSTEM, build_review_messages

logger = setup_logging("devmind-worker")
load_secrets()

MAX_ATTEMPTS = 3
BACKOFF_SECONDS = 2
JOBS_KEY = "webhook_jobs"

app = FastAPI(title="DevMind PR Worker")


def queue_backend() -> str:
    return os.environ.get("QUEUE_BACKEND", "redis").strip().lower() or "redis"


async def with_retries(label: str, coro_factory, attempts: int = MAX_ATTEMPTS):
    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await coro_factory()
        except Exception as e:
            last_err = e
            logger.warning("%s failed (attempt %s/%s): %s", label, attempt, attempts, e)
            if attempt < attempts:
                await asyncio.sleep(BACKOFF_SECONDS * attempt)
    raise last_err  # type: ignore[misc]


async def process_job(job: dict):
    diff_url = job.get("diff_url", "")
    repo = job.get("repo", "")
    pr_number = job.get("pr_number", 0)

    if not diff_url or not pr_number:
        logger.warning("skipping job missing diff_url/pr_number: %s", job)
        return

    logger.info("reviewing PR #%s in %s", pr_number, repo)

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
    logger.info("posted review to PR #%s", pr_number)


def parse_push_payload(body: dict) -> dict:
    message = body.get("message")
    if isinstance(message, dict) and message.get("data"):
        raw = base64.b64decode(message["data"]).decode("utf-8")
        job = json.loads(raw)
        if not isinstance(job, dict):
            raise ValueError("decoded Pub/Sub payload is not a JSON object")
        return job
    if "repo" in body or "pr_number" in body:
        return body
    raise ValueError("payload is not a Pub/Sub envelope or Job object")


@app.get("/health")
async def health():
    return {"status": "ok", "queue_backend": queue_backend()}


@app.post("/pubsub")
async def pubsub_push(request: Request):
    try:
        body = await request.json()
        job = parse_push_payload(body)
    except Exception as e:
        logger.error("dropping malformed pubsub payload: %s", e)
        # 2xx acks the message so poison pills cannot retry for days (Vertex cost).
        return JSONResponse({"status": "ignored", "reason": "malformed"}, status_code=200)

    try:
        await process_job(job)
    except Exception as e:
        logger.error("giving up on job after retries: %s | job=%s", e, job)
        # Ack after in-process retries to avoid Pub/Sub redelivery storms.
        return JSONResponse({"status": "error"}, status_code=200)

    return {"status": "ok"}


@app.on_event("startup")
async def startup():
    init_db()
    logger.info("worker http listening queue_backend=%s", queue_backend())
    if queue_backend() != "pubsub":
        asyncio.create_task(redis_loop())


async def redis_loop():
    r = await create_redis_client()
    logger.info("waiting for redis jobs on %s...", JOBS_KEY)

    while True:
        try:
            _, raw = await r.brpop(JOBS_KEY, timeout=0)
            job = json.loads(raw)
            try:
                await process_job(job)
            except Exception as e:
                logger.error("giving up on job after retries: %s | job=%s", e, job)
        except Exception as e:
            logger.error("worker error: %s", e)
            await asyncio.sleep(1)


async def redis_main():
    init_db()
    await redis_loop()


if __name__ == "__main__":
    if queue_backend() == "pubsub":
        port = int(os.environ.get("PORT", "8080"))
        uvicorn.run(app, host="0.0.0.0", port=port)
    else:
        asyncio.run(redis_main())
