# Shared-secret auth for service-to-service calls from the Express api-server.
from __future__ import annotations

import os

from fastapi import Header, HTTPException


def require_service_secret(
    x_devmind_secret: str | None = Header(default=None, alias="X-DevMind-Secret"),
) -> None:
    expected = os.environ.get("AI_BACKEND_SECRET", "").strip()
    if not expected:
        # Local/dev convenience: if unset, allow (portfolio default).
        # Production should always set AI_BACKEND_SECRET.
        return
    if not x_devmind_secret or x_devmind_secret.strip() != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_ingest_secret(
    x_devmind_secret: str | None = Header(default=None, alias="X-DevMind-Secret"),
    x_ingest_key: str | None = Header(default=None, alias="X-Ingest-Key"),
) -> None:
    ingest_key = os.environ.get("INGEST_API_KEY", "").strip()
    service_secret = os.environ.get("AI_BACKEND_SECRET", "").strip()
    if not ingest_key and not service_secret:
        return
    provided = (x_ingest_key or x_devmind_secret or "").strip()
    allowed = {k for k in (ingest_key, service_secret) if k}
    if provided not in allowed:
        raise HTTPException(status_code=401, detail="Unauthorized")
