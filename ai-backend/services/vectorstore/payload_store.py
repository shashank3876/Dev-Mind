# SQLite-backed payload store for vector stores that don't persist text (e.g. Vertex).
import json
import sqlite3
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).resolve().parents[2] / "vector_payloads.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS payloads (id TEXT PRIMARY KEY, text TEXT NOT NULL, metadata TEXT)"
    )
    return conn


def save_payloads(ids: list[str], texts: list[str], metadatas: list[dict[str, Any]]) -> None:
    if not ids:
        return
    conn = _connect()
    try:
        conn.executemany(
            "INSERT OR REPLACE INTO payloads (id, text, metadata) VALUES (?, ?, ?)",
            [
                (point_id, text, json.dumps(metadata or {}))
                for point_id, text, metadata in zip(ids, texts, metadatas)
            ],
        )
        conn.commit()
    finally:
        conn.close()


def get_texts(ids: list[str]) -> list[str]:
    if not ids:
        return []
    conn = _connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"SELECT id, text FROM payloads WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        by_id = {row[0]: row[1] for row in rows}
        return [by_id[i] for i in ids if i in by_id]
    finally:
        conn.close()
