# /chat route — accepts a message + user_id + provider, streams LLM response via SSE.
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest, ClearChatRequest
from services import memory, rag
from services.llm import DEFAULT_PROVIDER, get_provider, list_providers
from services.sse import format_sse
from services.vectorstore.types import VectorSearchHit

router = APIRouter()
logger = logging.getLogger("devmind-api")

BASE_SYSTEM = """You are DevMind, a friendly developer assistant in a chat UI.

Write like a helpful teammate, not like a pull-request review bot.

Style:
- Answer the question first, then add detail only if it helps.
- Use short markdown: headings, bullets, and fenced code with a language tag.
- Do not use a numbered audit format (### 1. Title, **Issue:**, **Suggestion:**) unless the user asked you to review a diff or PR.
- Do not invent a full architecture spec unless they asked for a design.
- Keep a conversational tone. Be concise."""


@router.get("/providers")
async def providers():
    return {"providers": list_providers(), "default": DEFAULT_PROVIDER}


@router.post("/chat")
async def chat(req: ChatRequest):
    provider_name = req.provider.value if req.provider else DEFAULT_PROVIDER
    llm = get_provider(provider_name)

    persist_sqlite = req.history is None
    if req.history is not None:
        history = [{"role": item.role, "content": item.content} for item in req.history]
    else:
        history = memory.get_history(req.user_id)
    history.append({"role": "user", "content": req.message})
    if persist_sqlite:
        memory.save_message(req.user_id, "user", req.message)

    rag_results: list[VectorSearchHit] = []
    try:
        rag_results = await rag.search(req.message)
    except Exception as e:
        logger.warning("RAG search failed, continuing without context: %s", e)

    if rag_results:
        context = "\n---\n".join(hit["text"] for hit in rag_results if hit.get("text"))
        system = f"{BASE_SYSTEM}\n\nRelevant context:\n{context}"
    else:
        system = BASE_SYSTEM

    context_count = len(rag_results)
    sources_json = json.dumps(
        [
            {
                "text": hit.get("text", ""),
                **({"source": hit["source"]} if hit.get("source") else {}),
                **({"score": hit["score"]} if hit.get("score") is not None else {}),
            }
            for hit in rag_results
        ]
    )

    async def event_stream():
        if context_count:
            yield format_sse(f"[CONTEXT:{context_count}]")
            yield format_sse(f"[SOURCES:{sources_json}]")
        full_reply = []
        async for token in llm.stream_response(history, system=system):
            full_reply.append(token)
            yield format_sse(token)
        if persist_sqlite:
            memory.save_message(req.user_id, "assistant", "".join(full_reply))
        yield format_sse("[DONE]")

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat/clear")
async def clear_chat(req: ClearChatRequest):
    deleted = memory.clear_history(req.user_id)
    return {"ok": True, "deleted": deleted}
