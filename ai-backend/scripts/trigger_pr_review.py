#!/usr/bin/env python3
"""Create a test PR (if needed) and enqueue a webhook job for the worker."""
import asyncio
import json
import os
import sys

import httpx
import redis.asyncio as aioredis
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
    return {
        "repo": f"{OWNER}/{REPO}",
        "pr_number": pr["number"],
        "diff_url": pr["diff_url"],
        "sha": pr["head"]["sha"],
        "author": pr["user"]["login"],
        "branch": pr["head"]["ref"],
        "event_type": "pull_request",
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
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        r = await aioredis.from_url(redis_url, decode_responses=True)
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
