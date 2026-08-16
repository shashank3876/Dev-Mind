# FastAPI entry point for DevMind ai-backend — mounts chat, ingest, and health routes.
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from services.logging_config import setup_logging
from services.memory import init_db
from services.secrets import load_secrets
from routes import chat, health, ingest, review

logger = setup_logging("devmind-api")
load_secrets()

app = FastAPI(title="DevMind AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    if os.environ.get("USE_GCP_TRACING", "false").lower() in ("true", "1", "yes"):
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

            FastAPIInstrumentor.instrument_app(app)
        except Exception:
            pass
    logger.info("AI backend started")


app.include_router(health.router)
app.include_router(chat.router)
app.include_router(ingest.router)
app.include_router(review.router)
