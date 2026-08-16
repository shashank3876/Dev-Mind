#!/usr/bin/env bash
# One-time Vertex AI Vector Search index setup for Dev-Mind RAG.
# Usage: ./scripts/gcp/setup-vector-index.sh <gcp-project-id> [region]
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <gcp-project-id> [region]}"
REGION="${2:-us-central1}"
INDEX_DISPLAY_NAME="devmind-vector-index"
ENDPOINT_DISPLAY_NAME="devmind-vector-endpoint"
DIMENSIONS=768

echo "==> Creating Vector Search index (${DIMENSIONS} dimensions)"
INDEX_ID=$(gcloud ai indexes create \
  --display-name="${INDEX_DISPLAY_NAME}" \
  --metadata-file=<(cat <<EOF
{
  "contentsDeltaUri": "gs://${PROJECT_ID}-devmind-vectors/initial",
  "config": {
    "dimensions": ${DIMENSIONS},
    "approximateNeighborsCount": 10,
    "distanceMeasureType": "COSINE_DISTANCE",
    "algorithmConfig": {
      "treeAhConfig": {
        "leafNodeEmbeddingCount": 500,
        "leafNodesToSearchPercent": 7
      }
    }
  }
}
EOF
) \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(name)")

echo "Index created: ${INDEX_ID}"
echo "Waiting for index to be ready (this can take 30+ minutes)..."

gcloud ai operations wait "$(gcloud ai indexes list \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --filter="displayName:${INDEX_DISPLAY_NAME}" \
  --format='value(name)')" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" 2>/dev/null || true

echo "==> Creating index endpoint"
ENDPOINT_ID=$(gcloud ai index-endpoints create \
  --display-name="${ENDPOINT_DISPLAY_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(name)")

echo "Endpoint created: ${ENDPOINT_ID}"
echo ""
echo "Next steps:"
echo "1. Deploy the index to the endpoint via Cloud Console or gcloud ai index-endpoints deploy-index"
echo "2. Add to .env:"
echo "   VECTOR_STORE=vertex"
echo "   EMBEDDING_PROVIDER=vertex"
echo "   VERTEX_INDEX_ENDPOINT=${ENDPOINT_ID}"
echo "   VERTEX_DEPLOYED_INDEX_ID=<deployed-index-id-from-console>"
