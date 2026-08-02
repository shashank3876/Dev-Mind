# GitHub API helpers: fetch PR diffs and post inline review comments.
import os
import httpx

GITHUB_API = "https://api.github.com"


def _headers():
    token = os.environ.get("GITHUB_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def fetch_diff(diff_url: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(diff_url, headers=_headers())
        resp.raise_for_status()
        return resp.text


async def post_review_comment(repo: str, pr_number: int, body: str):
    url = f"{GITHUB_API}/repos/{repo}/issues/{pr_number}/comments"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={"body": body}, headers=_headers())
        resp.raise_for_status()
        return resp.json()
