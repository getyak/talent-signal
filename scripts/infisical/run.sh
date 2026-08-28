#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_id="6e8dbb8d-93b9-4979-8248-62100d86e733"

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 ENVIRONMENT PATH [PATH ...] -- COMMAND [ARG ...]" >&2
  exit 2
fi

environment_slug="$1"
shift
case "$environment_slug" in
  dev | staging | prod) ;;
  *)
    echo "Infisical environment must be dev, staging, or prod." >&2
    exit 2
    ;;
esac

if [[ "$environment_slug" == "prod" && -z "${INFISICAL_TOKEN:-}" ]]; then
  echo "Production requires a short-lived Infisical Machine Identity token." >&2
  exit 1
fi

paths=()
while [[ $# -gt 0 && "$1" != "--" ]]; do
  if [[ ! "$1" =~ ^/[a-z0-9/-]+$ ]]; then
    echo "Invalid Infisical path: $1" >&2
    exit 2
  fi
  paths+=("$1")
  shift
done

if [[ $# -eq 0 || "$1" != "--" ]]; then
  echo "Missing -- before the child command." >&2
  exit 2
fi
shift
if [[ ${#paths[@]} -eq 0 || $# -eq 0 ]]; then
  echo "At least one path and one child command are required." >&2
  exit 2
fi
if ! command -v infisical >/dev/null 2>&1; then
  echo "Infisical CLI is required. See docs/operations/secrets.md." >&2
  exit 1
fi

command_chain=("$@")
for ((index=${#paths[@]} - 1; index >= 0; index--)); do
  command_chain=(
    infisical run
    --projectId "$project_id"
    --env "$environment_slug"
    --path "${paths[$index]}"
    --
    "${command_chain[@]}"
  )
done

cd "$repository_root"
exec "${command_chain[@]}"
