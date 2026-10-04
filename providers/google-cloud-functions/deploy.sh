#!/usr/bin/env bash
set -euo pipefail
# Prints a command by default. --execute is an explicit cloud mutation.
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != '--execute' ) ]]; then
  echo 'Usage: deploy.sh [--execute]' >&2; exit 2
fi
: "${GCP_PROJECT:?Set GCP_PROJECT}"
: "${GCP_REGION:?Set GCP_REGION}"
: "${GCP_SERVICE:?Set a new GCP_SERVICE name}"
: "${GCP_SERVICE_ACCOUNT:?Set a dedicated runtime service-account email}"
: "${GCP_BUILD_SERVICE_ACCOUNT:?Set a build service-account resource name}"
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source_dir="$root/build/packages/google-cloud-functions"
[[ -f "$source_dir/build/app.wasm" && -f "$source_dir/package-lock.json" ]] || {
  echo 'Build and package google-cloud-functions first; see README.md' >&2; exit 1;
}
command=(gcloud run deploy "$GCP_SERVICE" --project "$GCP_PROJECT" --region "$GCP_REGION"
  --source "$source_dir" --function almideApi --base-image nodejs24
  --service-account "$GCP_SERVICE_ACCOUNT" --build-service-account "$GCP_BUILD_SERVICE_ACCOUNT"
  --no-allow-unauthenticated --invoker-iam-check --ingress internal --concurrency 1
  --min-instances 0 --max-instances 3 --memory 256Mi --cpu 1 --timeout 30s)
printf '%q ' "${command[@]}"; printf '\n'
if [[ ${1:-} == '--execute' ]]; then exec "${command[@]}"; fi
