# /chat route — accepts a message + user_id + provider, streams LLM response via SSE.
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest, ClearChatRequest
from services import memory, rag
from services.llm import DEFAULT_PROVIDER, get_provider, list_providers

router = APIRouter()

BASE_SYSTEM = "You are DevMind, an expert AI code reviewer and developer assistant."


@router.get("/providers")
async def providers():
    return {"providers": list_providers(), "default": DEFAULT_PROVIDER}


@router.post("/chat")
async def chat(req: ChatRequest):
    provider_name = req.provider.value if req.provider else DEFAULT_PROVIDER
    llm = get_provider(provider_name)

    history = memory.get_history(req.user_id)
    history.append({"role": "user", "content": req.message})
    memory.save_message(req.user_id, "user", req.message)

    rag_results: list[str] = []
    try:
        rag_results = await rag.search(req.message)
    except Exception as e:
        print(f"[chat] RAG search failed, continuing without context: {e}")

    if rag_results:
        context = "\n---\n".join(rag_results)
        system = f"{BASE_SYSTEM}\n\nRelevant context:\n{context}"
    else:
        system = BASE_SYSTEM

    context_count = len(rag_results)

    async def event_stream():
        
        if context_count:
            yield f"data: [CONTEXT:{context_count}]\n\n"
        full_reply = []
        async for token in llm.stream_response(history, system=system):
            full_reply.append(token)
            yield f"data: {token}\n\n"
        memory.save_message(req.user_id, "assistant", "".join(full_reply))
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/chat/clear")
async def clear_chat(req: ClearChatRequest):
    deleted = memory.clear_history(req.user_id)
    return {"ok": True, "deleted": deleted}
