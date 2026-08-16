# Secret loading from environment or GCP Secret Manager.
import os
from typing import Optional

_cache: dict[str, str] = {}


def _use_gcp_secrets() -> bool:
    return os.environ.get("USE_GCP_SECRETS", "false").lower() in ("true", "1", "yes")


def get_secret(name: str, default: str = "") -> str:
    if name in _cache:
        return _cache[name]

    if _use_gcp_secrets():
        project_id = os.environ.get("GCP_PROJECT_ID")
        if not project_id:
            raise ValueError("GCP_PROJECT_ID is required when USE_GCP_SECRETS=true")
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        secret_name = f"projects/{project_id}/secrets/{name}/versions/latest"
        response = client.access_secret_version(request={"name": secret_name})
        value = response.payload.data.decode("UTF-8")
    else:
        value = os.environ.get(name, default)

    _cache[name] = value
    return value


def load_secrets() -> None:
    """Warm commonly used secrets into cache at startup."""
    if not _use_gcp_secrets():
        return

    for key in (
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GITHUB_TOKEN",
        "QDRANT_API_KEY",
    ):
        try:
            get_secret(key)
        except Exception:
            pass
