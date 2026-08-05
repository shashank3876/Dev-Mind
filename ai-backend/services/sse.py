# Helpers for Server-Sent Events — JSON-encode payloads so newlines don't break frames.
import json


def format_sse(payload: str) -> str:
    return f"data: {json.dumps(payload)}\n\n"
