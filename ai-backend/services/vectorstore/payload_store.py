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


def get_hits(ids: list[str], scores: list[float] | None = None) -> list[dict[str, Any]]:
    if not ids:
        return []
    conn = _connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"SELECT id, text, metadata FROM payloads WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        by_id = {row[0]: (row[1], row[2]) for row in rows}
        hits: list[dict[str, Any]] = []
        for index, point_id in enumerate(ids):
            if point_id not in by_id:
                continue
            text, metadata_raw = by_id[point_id]
            metadata = json.loads(metadata_raw) if metadata_raw else {}
            hit: dict[str, Any] = {"text": text}
            source = metadata.get("source")
            if source is not None:
                hit["source"] = str(source)
            if scores is not None and index < len(scores):
                hit["score"] = float(scores[index])
            hits.append(hit)
        return hits
    finally:
        conn.close()
