#!/usr/bin/env bash

set -uo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <log-slug> <command> [args...]" >&2
  exit 64
fi

check_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_slug="$1"
shift
log_path="$check_root/$log_slug.log"

command_line="$(printf '%q ' "$@")"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  printf 'COMMAND: %s\n' "$command_line"
  printf 'START_UTC: %s\n' "$started_at"
} | tee "$log_path"

set +e
"$@" 2>&1 | tee -a "$log_path"
command_status="${PIPESTATUS[0]}"
set -e

ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf 'END_UTC: %s\n' "$ended_at"
  printf 'EXIT_CODE: %s\n' "$command_status"
} | tee -a "$log_path"

exit "$command_status"
