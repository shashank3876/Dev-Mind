# GitHub API helpers: fetch PR diffs and post inline review comments.
import re
import httpx

from services.secrets import get_secret

GITHUB_API = "https://api.github.com"

PR_URL_PATTERN = re.compile(
    r"^https?://(?:www\.)?github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/pull/(?P<number>\d+)(?:/.*)?$",
    re.IGNORECASE,
)


def _headers(*, include_auth: bool = True) -> dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3.diff"}
    if include_auth:
        token = get_secret("GITHUB_TOKEN", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
            headers["X-GitHub-Api-Version"] = "2022-11-28"
    return headers


def parse_pr_url(url: str) -> tuple[str, int, str]:
    url = url.strip()
    match = PR_URL_PATTERN.match(url)
    if not match:
        raise ValueError("Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123")
    owner = match.group("owner")
    repo = match.group("repo")
    pr_number = int(match.group("number"))
    full_repo = f"{owner}/{repo}"
    diff_url = f"https://github.com/{full_repo}/pull/{pr_number}.diff"
    return full_repo, pr_number, diff_url


async def fetch_public_diff(diff_url: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(diff_url, headers=_headers(include_auth=False))
        if resp.status_code == 404:
            raise ValueError("PR not found. Make sure the URL is correct and the repo is public.")
        if resp.status_code in (401, 403):
            raise ValueError("Cannot access this PR. It may be private — only public PRs are supported.")
        resp.raise_for_status()
        return resp.text


async def fetch_diff(diff_url: str) -> str:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(diff_url, headers=_headers())
        resp.raise_for_status()
        return resp.text


async def post_review_comment(repo: str, pr_number: int, body: str):
    token = get_secret("GITHUB_TOKEN", "")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    url = f"{GITHUB_API}/repos/{repo}/issues/{pr_number}/comments"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json={"body": body}, headers=headers)
        resp.raise_for_status()
        return resp.json()
