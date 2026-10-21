#!/usr/bin/env bash
# Run from the repository root in an authenticated Cloud Shell. This script never accepts or prints a Gemini key.
set -euo pipefail
: "${PROJECT_ID:?Set the authorized Google Cloud project ID}"
: "${REGION:?Set an approved Cloud Run / Artifact Registry region}"
: "${GOOGLE_CLIENT_IDS:?Set the Desktop OAuth client ID(s)}"
: "${GOOGLE_DOMAINS:?Set verified employee Google Workspace domain(s)}"
: "${GEMINI_MODEL:?Select an available Gemini image/structured-output model}"
# Secrets must already exist in Secret Manager. Bind only the dedicated service identity.
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com
# Create these once if absent; inspect existing resources rather than replacing them.
if ! gcloud artifacts repositories describe receipt-ocr --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create receipt-ocr --repository-format docker --location "$REGION"
fi
if ! gcloud iam service-accounts describe "receipt-ocr@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
  gcloud iam service-accounts create receipt-ocr --display-name 'STeP receipt OCR'
fi
for secret_name in step-receipt-gemini-key step-receipt-quota-hmac; do
  gcloud secrets describe "$secret_name" >/dev/null
  gcloud secrets add-iam-policy-binding "$secret_name" --member "serviceAccount:receipt-ocr@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/secretmanager.secretAccessor >/dev/null
done
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:receipt-ocr@${PROJECT_ID}.iam.gserviceaccount.com" --role roles/datastore.user >/dev/null
# Require an existing approved Native Firestore database. Never choose its permanent location silently.
gcloud firestore databases describe --database='(default)' >/dev/null
image_url="${REGION}-docker.pkg.dev/${PROJECT_ID}/receipt-ocr/service:$(git rev-parse HEAD)"
config_path=$(mktemp)
trap 'rm -f "$config_path"' EXIT
cat > "$config_path" <<'YAML'
steps:
  - name: gcr.io/cloud-builders/docker
    env: ['DOCKER_BUILDKIT=1']
    args: ['build', '-f', 'gateway/receipt/Dockerfile', '-t', '${_IMAGE}', '.']
images: ['${_IMAGE}']
YAML
gcloud builds submit --config "$config_path" --substitutions "_IMAGE=$image_url" .
# Public transport, authenticated by the service's verified Google OIDC audience/domain checks; not public OCR.
gcloud run deploy step-receipt-ocr --image "$image_url" --region "$REGION" --service-account "receipt-ocr@${PROJECT_ID}.iam.gserviceaccount.com" --allow-unauthenticated --concurrency 4 --max-instances 3 --min-instances 0 --cpu 1 --memory 512Mi --timeout 180 --set-env-vars "^|^GOOGLE_CLOUD_PROJECT=$PROJECT_ID|GOOGLE_CLIENT_IDS=$GOOGLE_CLIENT_IDS|GOOGLE_DOMAINS=$GOOGLE_DOMAINS|GEMINI_MODEL=$GEMINI_MODEL|MAX_DAILY_REQUESTS=200|MAX_USER_DAILY_REQUESTS=20" --set-secrets 'GEMINI_API_KEY=step-receipt-gemini-key:latest,QUOTA_HMAC_KEY=step-receipt-quota-hmac:latest'
gcloud run services describe step-receipt-ocr --region "$REGION" --format='value(status.url)'
