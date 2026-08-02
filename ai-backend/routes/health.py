# Health check route — returns 200 OK with status json.
from fastapi import APIRouter
from models.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")
