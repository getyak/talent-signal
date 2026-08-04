#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repository_root"

status=0

while IFS=: read -r file line_number definition; do
  reference="${definition#*uses:}"
  reference="${reference%%#*}"
  reference="${reference//[[:space:]]/}"
  reference="${reference%\"}"
  reference="${reference#\"}"
  reference="${reference%\'}"
  reference="${reference#\'}"

  if [[ "$reference" == ./* ]]; then
    continue
  fi

  if [[ "$reference" =~ ^docker://.+@sha256:[0-9a-f]{64}$ ]]; then
    continue
  fi

  if [[ ! "$reference" =~ @[0-9a-f]{40}$ ]]; then
    printf '%s:%s: action is not pinned to a full commit SHA: %s\n' \
      "$file" "$line_number" "$reference" >&2
    status=1
  fi
done < <(grep -R -n -E '^[[:space:]]*(uses:|- uses:)' .github/workflows --include='*.yml' --include='*.yaml')

exit "$status"
