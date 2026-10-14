#!/usr/bin/env python3
"""Create a test PR (if needed) and enqueue a webhook job for the worker."""
import asyncio
import json
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

OWNER = "shashank3876"
REPO = "Dev-Mind"
HEAD = "test/webhook-demo"
BASE = "test/pr-review-v2"
JOBS_KEY = "webhook_jobs"


def _headers() -> dict[str, str]:
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise SystemExit("GITHUB_TOKEN is not set in ai-backend/.env")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def get_or_create_pr(client: httpx.AsyncClient) -> dict:
    resp = await client.get(
        f"https://api.github.com/repos/{OWNER}/{REPO}/pulls",
        params={"state": "open", "head": f"{OWNER}:{HEAD}"},
        headers=_headers(),
    )
    resp.raise_for_status()
    pulls = resp.json()
    if pulls:
        return pulls[0]

    create = await client.post(
        f"https://api.github.com/repos/{OWNER}/{REPO}/pulls",
        headers=_headers(),
        json={
            "title": "Test: DevMind webhook PR review",
            "head": HEAD,
            "base": BASE,
            "body": "Automated test PR for DevMind review worker.",
        },
    )
    if create.status_code >= 400:
        raise SystemExit(f"Failed to create PR: {create.status_code} {create.text}")
    return create.json()


def _job_payload(pr: dict) -> dict:
    from services.jobs import DEFAULT_MAX_ATTEMPTS, idempotency_key, new_job_id

    repo = f"{OWNER}/{REPO}"
    sha = pr["head"]["sha"]
    number = pr["number"]
    return {
        "id": new_job_id(),
        "delivery_id": f"manual-{new_job_id()}",
        "idempotency_key": idempotency_key(repo, number, sha),
        "repo": repo,
        "pr_number": number,
        "diff_url": pr["diff_url"],
        "sha": sha,
        "author": pr["user"]["login"],
        "branch": pr["head"]["ref"],
        "event_type": "pull_request",
        "attempt": 0,
        "max_attempts": DEFAULT_MAX_ATTEMPTS,
        "status": "queued",
    }


async def enqueue_job(pr: dict) -> None:
    job = _job_payload(pr)
    backend = os.environ.get("QUEUE_BACKEND", "redis").strip().lower() or "redis"
    if backend == "pubsub":
        import shutil
        import subprocess

        if not shutil.which("gcloud"):
            raise SystemExit("gcloud is required to publish when QUEUE_BACKEND=pubsub")
        topic = os.environ.get("PUBSUB_TOPIC", "devmind-pr-jobs")
        subprocess.run(
            ["gcloud", "pubsub", "topics", "publish", topic, f"--message={json.dumps(job)}"],
            check=True,
        )
        print(f"Published review job to Pub/Sub topic {topic} for PR #{pr['number']} ({job['repo']})")
    else:
        from services.redis_client import create_redis_client, load_env

        load_env()
        r = await create_redis_client()
        await r.lpush(JOBS_KEY, json.dumps(job))
        await r.aclose()
        print(f"Enqueued review job for PR #{pr['number']} ({job['repo']})")
    print(f"PR URL: {pr['html_url']}")


async def main() -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        pr = await get_or_create_pr(client)
        print(f"Using PR #{pr['number']}: {pr['title']}")
        await enqueue_job(pr)


if __name__ == "__main__":
    asyncio.run(main())
