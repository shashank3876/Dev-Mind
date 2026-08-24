# Pydantic models shared across routes and services.
from enum import Enum
from pydantic import BaseModel
from typing import Any, Optional


class LLMProviderName(str, Enum):
    claude = "claude"
    gemini = "gemini"
    openai = "openai"
    vertex = "vertex"


class ChatHistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_id: str = "anonymous"
    provider: Optional[LLMProviderName] = None
    history: Optional[list[ChatHistoryMessage]] = None


class ChatResponse(BaseModel):
    reply: str


class ClearChatRequest(BaseModel):
    user_id: str


class IngestRequest(BaseModel):
    text: str
    metadata: Optional[dict[str, Any]] = None


class IngestResponse(BaseModel):
    ok: bool
    chunks: int


class HealthResponse(BaseModel):
    status: str


class ReviewRequest(BaseModel):
    pr_url: str
    provider: Optional[LLMProviderName] = None


class ReviewAskRequest(BaseModel):
    question: str
    review: str
    pr_url: Optional[str] = None
    repo: Optional[str] = None
    pr_number: Optional[int] = None
    history: Optional[list[ChatHistoryMessage]] = None
    provider: Optional[LLMProviderName] = None


class ReviewResponse(BaseModel):
    review: str
    repo: str
    pr_number: int
