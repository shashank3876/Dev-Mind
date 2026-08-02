# SQLite-backed long-term memory: stores per-user chat history and retrieves last N messages.
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "memory.db"


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   TEXT NOT NULL,
                role      TEXT NOT NULL,
                content   TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        conn.commit()


def save_message(user_id: str, role: str, content: str):
    with _conn() as conn:
        conn.execute(
            "INSERT INTO messages (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            (user_id, role, content, datetime.utcnow().isoformat()),
        )
        conn.commit()


def get_history(user_id: str, limit: int = 10) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def clear_history(user_id: str) -> int:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM messages WHERE user_id = ?", (user_id,))
        conn.commit()
        return cur.rowcount
