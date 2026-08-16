# Structured logging for local dev and GCP Cloud Logging.
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "severity": record.levelname,
            "service": self.service_name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging(service_name: str = "devmind-ai") -> logging.Logger:
    use_gcp = os.environ.get("USE_GCP_LOGGING", "false").lower() in ("true", "1", "yes")
    use_tracing = os.environ.get("USE_GCP_TRACING", "false").lower() in ("true", "1", "yes")

    if use_gcp:
        try:
            import google.cloud.logging

            client = google.cloud.logging.Client()
            client.setup_logging()
        except Exception:
            pass

    if use_tracing:
        try:
            from opentelemetry import trace
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            provider = TracerProvider()
            provider.add_span_processor(BatchSpanProcessor(CloudTraceSpanExporter()))
            trace.set_tracer_provider(provider)
        except Exception:
            pass

    logger = logging.getLogger(service_name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter(service_name))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False

    return logger
