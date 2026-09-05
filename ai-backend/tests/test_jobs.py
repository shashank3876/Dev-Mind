import json

from services.job_store import JobStore
from services.jobs import backoff_seconds, idempotency_key, normalize_job, parse_push_payload


def test_idempotency_key():
    assert idempotency_key("acme/app", 3, "abc") == "acme/app#3@abc"


def test_backoff_is_exponential_without_jitter():
    assert backoff_seconds(1, jitter=False) == 2
    assert backoff_seconds(2, jitter=False) == 4
    assert backoff_seconds(3, jitter=False) == 8
    assert backoff_seconds(10, jitter=False, cap=60) == 60


def test_normalize_job_fills_ids(tmp_path):
    job = normalize_job({"repo": "a/b", "pr_number": 1, "sha": "s", "diff_url": "u"})
    assert job["id"]
    assert job["idempotency_key"] == "a/b#1@s"
    assert job["max_attempts"] == 5
    assert job["status"] == "queued"


def test_job_store_claim_and_duplicate(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    store.init()
    job = normalize_job(
        {
            "id": "job-1",
            "delivery_id": "del-1",
            "repo": "a/b",
            "pr_number": 1,
            "sha": "s",
            "diff_url": "u",
        }
    )
    status, claimed = store.claim(job)
    assert status == "processing"
    store.mark(claimed, "succeeded")

    status, existing = store.claim({**job, "id": "job-2"})
    assert status == "duplicate"
    assert existing["id"] == "job-1"
    assert existing["status"] == "succeeded"


def test_job_store_same_delivery_reuses_row(tmp_path):
    store = JobStore(tmp_path / "jobs.db")
    store.init()
    first = normalize_job(
        {
            "id": "job-1",
            "delivery_id": "del-1",
            "repo": "a/b",
            "pr_number": 1,
            "sha": "s",
        }
    )
    store.claim(first)
    status, claimed = store.claim(
        normalize_job(
            {
                "id": "job-2",
                "delivery_id": "del-1",
                "repo": "a/b",
                "pr_number": 1,
                "sha": "s",
            }
        )
    )
    assert status == "processing"
    assert claimed["id"] == "job-1"


def test_parse_push_payload_pubsub_envelope():
    body = {
        "deliveryAttempt": 3,
        "message": {
            "data": __import__("base64").b64encode(
                json.dumps({"repo": "a/b", "pr_number": 1}).encode()
            ).decode(),
            "attributes": {"job_id": "j1", "delivery_id": "d1"},
        },
    }
    job, attempt = parse_push_payload(body)
    assert attempt == 3
    assert job["repo"] == "a/b"
    assert job["id"] == "j1"
    assert job["delivery_id"] == "d1"
