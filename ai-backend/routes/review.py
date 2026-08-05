# /review route — accepts a public GitHub PR URL and streams an AI code review via SSE.
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.schemas import ReviewRequest
from services import github as gh_service
from services.llm import DEFAULT_PROVIDER, get_provider
from services.review_prompt import MAX_OUTPUT_TOKENS, REVIEW_SYSTEM, build_review_messages
from services.sse import format_sse

router = APIRouter()


@router.post("/review")
async def review_pr(req: ReviewRequest):
    try:
        repo, pr_number, diff_url = gh_service.parse_pr_url(req.pr_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        diff = await gh_service.fetch_public_diff(diff_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch PR diff: {e}") from e

    if not diff.strip():
        raise HTTPException(status_code=400, detail="PR diff is empty.")

    provider_name = req.provider.value if req.provider else DEFAULT_PROVIDER
    llm = get_provider(provider_name)
    messages = build_review_messages(diff)

    async def event_stream():
        yield format_sse(f"[META:{repo}:{pr_number}]")
        review = await llm.one_shot(messages, system=REVIEW_SYSTEM, max_output_tokens=MAX_OUTPUT_TOKENS)
        yield format_sse(review)
        yield format_sse("[DONE]")

    return StreamingResponse(event_stream(), media_type="text/event-stream")
