# Background worker: pops jobs from Redis "webhook_jobs", fetches PR diffs,
# sends them to the LLM for review, then posts the review as a GitHub PR comment.
import asyncio
import json
import os
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

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


async def main():
    init_db()
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    r = await aioredis.from_url(redis_url, decode_responses=True)
    logger.info("waiting for jobs...")

    while True:
        try:
            _, raw = await r.brpop("webhook_jobs", timeout=0)
            job = json.loads(raw)
            try:
                await process_job(job)
            except Exception as e:
                logger.error("giving up on job after retries: %s | job=%s", e, job)
        except Exception as e:
            logger.error("worker error: %s", e)
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
