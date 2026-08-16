# Vertex AI Vector Search (Matching Engine) implementation.
import os
from typing import Any, Optional

from google.cloud import aiplatform

from services.vectorstore.base import VectorStore
from services.vectorstore.payload_store import get_texts, save_payloads


class VertexVectorStore(VectorStore):
    name = "vertex"

    def __init__(self) -> None:
        project = os.environ.get("GCP_PROJECT_ID")
        if not project:
            raise ValueError("GCP_PROJECT_ID is not set")
        location = os.environ.get("GCP_REGION", "us-central1")
        aiplatform.init(project=project, location=location)

        endpoint_name = os.environ.get("VERTEX_INDEX_ENDPOINT")
        deployed_index_id = os.environ.get("VERTEX_DEPLOYED_INDEX_ID")
        if not endpoint_name or not deployed_index_id:
            raise ValueError(
                "VERTEX_INDEX_ENDPOINT and VERTEX_DEPLOYED_INDEX_ID are required for vertex vector store"
            )

        self._endpoint = aiplatform.MatchingEngineIndexEndpoint(index_endpoint_name=endpoint_name)
        self._deployed_index_id = deployed_index_id
        self._vector_size = 0

    async def ensure_collection(self, vector_size: int) -> None:
        self._vector_size = vector_size

    async def upsert(
        self,
        ids: list[str],
        vectors: list[list[float]],
        payloads: list[dict[str, Any]],
    ) -> None:
        if not ids:
            return
        texts = [p.get("text", "") for p in payloads]
        save_payloads(ids, texts, payloads)
        datapoints = [
            {"datapoint_id": point_id, "feature_vector": vector}
            for point_id, vector in zip(ids, vectors)
        ]
        self._endpoint.upsert_datapoints(
            deployed_index_id=self._deployed_index_id,
            datapoints=datapoints,
        )

    async def search(self, vector: list[float], top_k: int = 5) -> list[str]:
        response = self._endpoint.find_neighbors(
            deployed_index_id=self._deployed_index_id,
            queries=[vector],
            num_neighbors=top_k,
        )
        if not response or not response[0]:
            return []
        ids = [
            neighbor.datapoint.datapoint_id
            for neighbor in response[0]
            if neighbor.datapoint and neighbor.datapoint.datapoint_id
        ]
        return get_texts(ids)


_store: Optional[VertexVectorStore] = None


def get_vertex_vector_store() -> VertexVectorStore:
    global _store
    if _store is None:
        _store = VertexVectorStore()
    return _store
