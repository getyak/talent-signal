#!/usr/bin/env bash
# Fail-closed classifier for the low-cost CI policy.
#
# Prints "true" when a change set must run the full quality and security
# gates, and "false" only when every changed path is documentation or
# knowledge-only. Code, workflows, configuration, empty diffs, missing refs,
# and any ambiguous input all print "true" so an intentional skip can never be
# fabricated from a failed or partial comparison.
set -euo pipefail

base_sha="${1:-}"
head_sha="${2:-HEAD}"

# Documentation and knowledge surfaces. These paths hold prose and media that
# do not affect runtime behavior, product builds, or security scanning.
documentation_prefixes=(
  docs/
  _index/
)

is_documentation_path() {
  local path="$1"

  case "$path" in
    *.md) return 0 ;;
  esac

  local prefix
  for prefix in "${documentation_prefixes[@]}"; do
    case "$path" in
      "$prefix"*) return 0 ;;
    esac
  done

  return 1
}

# Fail closed on missing input or unresolvable revisions.
if [ -z "$base_sha" ] ||
  ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null ||
  ! git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
  printf 'true\n'
  exit 0
fi

# An empty or unreadable diff is not evidence of a documentation-only change.
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
  if ! is_documentation_path "$path"; then
    printf 'true\n'
    exit 0
  fi
done <<< "$changed_paths"

printf 'false\n'
