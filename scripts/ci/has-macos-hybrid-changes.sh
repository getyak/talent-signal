#!/usr/bin/env bash
# Reports whether a revision range can affect the macOS Hybrid application.
# Missing refs, empty diffs, and ambiguous input fail closed to a full check.
set -euo pipefail

base_sha="${1:-}"
head_sha="${2:-HEAD}"

if [ -z "$base_sha" ] ||
  ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null ||
  ! git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
  printf 'true\n'
  exit 0
fi

if ! changed_paths="$(git diff --no-renames --name-only --diff-filter=ACDMRTUXB "$base_sha" "$head_sha")"; then
  printf 'true\n'
  exit 0
fi

if [ -z "$changed_paths" ]; then
  printf 'true\n'
  exit 0
fi

while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    apps/macos-hybrid/*|packages/workspace-ui/*|scripts/macos/*|patches/*|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|.npmrc|.github/workflows/ci.yml|scripts/ci/has-macos-hybrid-changes.sh)
      printf 'true\n'
      exit 0
      ;;
  esac
done <<< "$changed_paths"

printf 'false\n'
