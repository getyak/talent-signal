#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker compose --file "$repository_root/deploy/opik/compose.json" up --detach --wait
curl --fail --silent --show-error http://localhost:5173/api/is-alive/ver
