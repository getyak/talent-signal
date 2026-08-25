#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
production_env="${TS_PRODUCTION_ENV_FILE:-/etc/talent-signal/production.env}"

if [[ ! -r "$production_env" ]]; then
  echo "Production environment file is not readable: $production_env" >&2
  exit 1
fi

compose=(
  docker compose
  --project-name talent-signal-production
  --env-file "$production_env"
  --file "$repository_root/compose.production.yaml"
)

"${compose[@]}" config --quiet
# Both services use the same tagged image. Building only the API prevents
# Compose from scheduling duplicate dependency installs on a small host; the
# migration runner reuses the resulting image.
"${compose[@]}" build api
"${compose[@]}" up --detach --wait postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" up --detach --wait --remove-orphans api caddy

"${compose[@]}" exec -T api node -e \
  "fetch('http://127.0.0.1:4317/health/ready').then(r=>{if(!r.ok)process.exit(1);console.log('Backend readiness verified.')}).catch(()=>process.exit(1))"
"${compose[@]}" ps
