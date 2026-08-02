# /ingest route — indexes text chunks into Qdrant for RAG retrieval.
from fastapi import APIRouter, HTTPException
from models.schemas import IngestRequest, IngestResponse
from services import rag

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        ids = await rag.upsert(req.text, metadata=req.metadata)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"ingest failed: {e}") from e
    return IngestResponse(ok=True, chunks=len(ids))
