# FastAPI entry point for DevMind ai-backend — mounts chat, ingest, and health routes.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from services.memory import init_db
from routes import chat, health, ingest, review

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


app.include_router(health.router)
app.include_router(chat.router)
app.include_router(ingest.router)
app.include_router(review.router)
