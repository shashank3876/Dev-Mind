#!/usr/bin/env bash
# One-time GCP project setup for Dev-Mind AI services.
# Usage: ./scripts/gcp/setup-project.sh <gcp-project-id> [region]
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <gcp-project-id> [region]}"
REGION="${2:-us-central1}"
SA_NAME="devmind-ai"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Setting project to ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

echo "==> Enabling required APIs"
gcloud services enable \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Creating service account ${SA_EMAIL}"
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="DevMind AI Backend" \
  2>/dev/null || echo "Service account already exists, continuing..."

echo "==> Granting IAM roles"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --quiet

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "==> Creating Artifact Registry repository"
gcloud artifacts repositories create devmind \
  --repository-format=docker \
  --location="${REGION}" \
  2>/dev/null || echo "Artifact Registry repo already exists, continuing..."

KEY_FILE="${HOME}/.config/gcp/devmind-${PROJECT_ID}-key.json"
echo "==> Creating local dev key at ${KEY_FILE}"
mkdir -p "$(dirname "${KEY_FILE}")"
gcloud iam service-accounts keys create "${KEY_FILE}" \
  --iam-account="${SA_EMAIL}"

echo ""
echo "Setup complete. Add these to your .env:"
echo "GCP_PROJECT_ID=${PROJECT_ID}"
echo "GCP_REGION=${REGION}"
echo "GOOGLE_APPLICATION_CREDENTIALS=${KEY_FILE}"
echo ""
echo "For local ADC without a key file, run:"
echo "  gcloud auth application-default login"
