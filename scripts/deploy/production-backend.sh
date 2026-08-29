#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${TS_INFISICAL_INJECTED:-false}" != "true" ]]; then
  exec "$repository_root/scripts/infisical/run.sh" \
    prod /shared /backend -- \
    env TS_INFISICAL_INJECTED=true "$0" "$@"
fi

compose=(
  docker compose
  --project-name talent-signal-production
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
