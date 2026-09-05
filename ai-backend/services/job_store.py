# Durable job ledger for status, idempotency, and dead-letter records.
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.jobs import (
    STATUS_DEAD_LETTER,
    STATUS_DUPLICATE,
    STATUS_PROCESSING,
    STATUS_SUCCEEDED,
    normalize_job,
)

_DEFAULT_DB = Path(__file__).parent.parent / "jobs.db"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    def __init__(self, db_path: Path | None = None):
        self.db_path = Path(db_path) if db_path else _DEFAULT_DB

    def init(self) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS webhook_jobs (
                    id TEXT PRIMARY KEY,
                    delivery_id TEXT,
                    idempotency_key TEXT NOT NULL,
                    repo TEXT,
                    pr_number INTEGER,
                    sha TEXT,
                    status TEXT NOT NULL,
                    attempt INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    last_error TEXT,
                    payload TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS webhook_jobs_delivery_uidx "
                "ON webhook_jobs(delivery_id) WHERE delivery_id IS NOT NULL AND delivery_id != ''"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS webhook_jobs_idem_idx ON webhook_jobs(idempotency_key)"
            )
            conn.commit()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM webhook_jobs WHERE id = ?", (job_id,)
            ).fetchone()
        return self._row_to_job(row) if row else None

    def list_jobs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM webhook_jobs ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def list_dead_letters(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM webhook_jobs WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
                (STATUS_DEAD_LETTER, limit),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def find_succeeded(self, *, delivery_id: str, idempotency_key: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            if delivery_id:
                row = conn.execute(
                    "SELECT * FROM webhook_jobs WHERE delivery_id = ? AND status = ?",
                    (delivery_id, STATUS_SUCCEEDED),
                ).fetchone()
                if row:
                    return self._row_to_job(row)
            if idempotency_key:
                row = conn.execute(
                    "SELECT * FROM webhook_jobs WHERE idempotency_key = ? AND status = ?",
                    (idempotency_key, STATUS_SUCCEEDED),
                ).fetchone()
                if row:
                    return self._row_to_job(row)
        return None

    def _lookup(self, conn: sqlite3.Connection, job: dict[str, Any]) -> sqlite3.Row | None:
        row = conn.execute("SELECT * FROM webhook_jobs WHERE id = ?", (job["id"],)).fetchone()
        if row:
            return row
        if job["delivery_id"]:
            row = conn.execute(
                "SELECT * FROM webhook_jobs WHERE delivery_id = ?",
                (job["delivery_id"],),
            ).fetchone()
            if row:
                return row
        if job["idempotency_key"]:
            return conn.execute(
                "SELECT * FROM webhook_jobs WHERE idempotency_key = ? ORDER BY updated_at DESC",
                (job["idempotency_key"],),
            ).fetchone()
        return None

    def claim(self, job: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        """Mark a job processing, or skip if this delivery/SHA already succeeded."""
        job = normalize_job(job)
        existing = self.find_succeeded(
            delivery_id=job["delivery_id"],
            idempotency_key=job["idempotency_key"],
        )
        if existing:
            return STATUS_DUPLICATE, existing

        now = _now()
        job["status"] = STATUS_PROCESSING
        with self._conn() as conn:
            current = self._lookup(conn, job)
            if current and current["status"] == STATUS_SUCCEEDED:
                return STATUS_DUPLICATE, self._row_to_job(current)
            if current:
                job["id"] = current["id"]
                conn.execute(
                    """
                    UPDATE webhook_jobs
                    SET status = ?, attempt = ?, last_error = NULL, payload = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (STATUS_PROCESSING, job["attempt"], json.dumps(job), now, job["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO webhook_jobs (
                        id, delivery_id, idempotency_key, repo, pr_number, sha,
                        status, attempt, max_attempts, last_error, payload,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                    """,
                    (
                        job["id"],
                        job["delivery_id"] or None,
                        job["idempotency_key"],
                        job["repo"],
                        job["pr_number"],
                        job["sha"],
                        STATUS_PROCESSING,
                        job["attempt"],
                        job["max_attempts"],
                        json.dumps(job),
                        now,
                        now,
                    ),
                )
            conn.commit()
        return STATUS_PROCESSING, job

    def mark(
        self,
        job: dict[str, Any],
        status: str,
        *,
        error: str | None = None,
    ) -> dict[str, Any]:
        job = normalize_job(job)
        job["status"] = status
        job["last_error"] = error
        now = _now()
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE webhook_jobs
                SET status = ?, attempt = ?, last_error = ?, payload = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, job["attempt"], error, json.dumps(job), now, job["id"]),
            )
            conn.commit()
        return job

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        raw = row["payload"]
        if raw:
            try:
                loaded = json.loads(raw)
                if isinstance(loaded, dict):
                    payload = loaded
            except json.JSONDecodeError:
                payload = {}
        payload.update(
            {
                "id": row["id"],
                "delivery_id": row["delivery_id"] or "",
                "idempotency_key": row["idempotency_key"],
                "repo": row["repo"] or "",
                "pr_number": row["pr_number"] or 0,
                "sha": row["sha"] or "",
                "status": row["status"],
                "attempt": row["attempt"],
                "max_attempts": row["max_attempts"],
                "last_error": row["last_error"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        )
        return payload


store = JobStore()
