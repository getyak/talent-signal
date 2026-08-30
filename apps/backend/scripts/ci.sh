#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

"$repo_root/packages/contracts/node_modules/.bin/tsc6" \
  -p "$repo_root/packages/contracts/tsconfig.json"

"$repo_root/apps/agent/node_modules/.bin/tsc6" \
  -p "$repo_root/apps/agent/tsconfig.json" \
  --noEmit

"$repo_root/apps/agent/node_modules/.bin/vitest" \
  run \
  src \
  --root "$repo_root/apps/agent"

"$repo_root/apps/agent/node_modules/.bin/tsc6" \
  -p "$repo_root/apps/agent/tsconfig.build.json"

"$repo_root/apps/backend/node_modules/.bin/tsc6" \
  -p "$repo_root/apps/backend/tsconfig.json" \
  --noEmit

"$repo_root/apps/backend/node_modules/.bin/vitest" \
  run \
  --root "$repo_root/apps/backend"

"$repo_root/apps/backend/node_modules/.bin/tsc6" \
  -p "$repo_root/apps/backend/tsconfig.json"
