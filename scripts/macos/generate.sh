#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAC_APP_DIR="$REPOSITORY_ROOT/apps/macos"
XCODEGEN_BIN="${XCODEGEN_BIN:-$(command -v xcodegen || true)}"

if [[ -z "$XCODEGEN_BIN" ]]; then
  echo "xcodegen is required. Install it or set XCODEGEN_BIN." >&2
  exit 1
fi

"$XCODEGEN_BIN" generate --spec "$MAC_APP_DIR/project.yml" --project "$MAC_APP_DIR"

