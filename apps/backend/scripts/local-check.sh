#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
check_project="talent-signal-backend-check"
artifact_dir="$repo_root/docs/evaluations/overnight/backend"

export POSTGRES_PORT=55433
export BACKEND_PORT=4318
export PNPM_CONFIG_IGNORE_SCRIPTS=true

capture_service_evidence() {
  docker compose \
    --project-directory "$repo_root" \
    -p "$check_project" \
    ps --format json > "$artifact_dir/compose-services.jsonl" 2>/dev/null || true

  docker compose \
    --project-directory "$repo_root" \
    -p "$check_project" \
    logs --no-color api migrate seed \
    2>/dev/null \
    | sed -E 's/(Bearer )[A-Za-z0-9._~-]+/\1[redacted]/g' \
    > "$artifact_dir/docker-services.log" || true
}

down_check_project() {
  docker compose \
    --project-directory "$repo_root" \
    -p "$check_project" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
}

finish() {
  capture_service_evidence
  down_check_project
}
trap finish EXIT

down_check_project

(
  cd "$repo_root"
  pnpm install --frozen-lockfile --ignore-scripts
)
"$repo_root/apps/backend/scripts/ci.sh"

docker compose \
  --project-directory "$repo_root" \
  -p "$check_project" \
  up --build --wait

API_BASE_URL="http://127.0.0.1:$BACKEND_PORT" \
EVALUATION_ARTIFACT_DIR="$artifact_dir" \
node "$repo_root/apps/backend/dist/evaluation/runEvaluation.js"

capture_service_evidence
