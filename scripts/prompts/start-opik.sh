#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose=(docker compose --file "$repository_root/deploy/opik/compose.json")
previous_analytics="$("${compose[@]}" ps --all --quiet clickhouse)"
"${compose[@]}" up --detach --wait mysql redis minio clickhouse zookeeper mc
current_analytics="$("${compose[@]}" ps --all --quiet clickhouse)"
backend="$("${compose[@]}" ps --all --quiet backend)"
# Moving between worktrees can recreate ClickHouse's bind mounts. Renew the
# backend's pooled connections before waiting for dependent frontend readiness.
if [[ -n "$backend" ]]; then
  health="$(docker inspect "$backend" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"
  if [[ "$health" == "unhealthy" || ( -n "$previous_analytics" && "$previous_analytics" != "$current_analytics" ) ]]; then
    "${compose[@]}" restart backend
  fi
fi
"${compose[@]}" up --detach --wait
curl --fail --silent --show-error http://localhost:5173/api/is-alive/ver
