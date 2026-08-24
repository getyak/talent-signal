#!/usr/bin/env bash
set -euo pipefail

base_sha="${1:-}"
head_sha="${2:-HEAD}"
include_ci_files="${3:-}"

paths=(
  apps/ios
  fastlane
  scripts/ios
  Gemfile
  Gemfile.lock
)

if [ "$include_ci_files" = "--ci-files" ]; then
  paths+=(
    .github/workflows/ci.yml
    .github/workflows/release-ios.yml
    .github/workflows/security.yml
    scripts/ci/has-ios-changes.sh
    scripts/ci/next-ios-version.sh
    scripts/ci/test-next-ios-version.sh
  )
fi

if [ -z "$base_sha" ] ||
  ! git cat-file -e "${base_sha}^{commit}" 2>/dev/null ||
  ! git cat-file -e "${head_sha}^{commit}" 2>/dev/null; then
  printf 'true\n'
  exit 0
fi

if git diff --quiet "$base_sha" "$head_sha" -- "${paths[@]}"; then
  printf 'false\n'
else
  printf 'true\n'
fi
