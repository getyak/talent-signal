#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repository_root"

status=0

while IFS= read -r path; do
  case "$path" in
    *.env.example | .env.example)
      ;;
    *)
      printf 'Tracked secret-like file is not allowed: %s\n' "$path" >&2
      status=1
      ;;
  esac
done < <(
  git ls-files |
    grep -E '(^|/)(\.env($|\.)|.*\.(pem|p8|p12|key|mobileprovision)$|secrets/)' ||
    true
)

secret_pattern='(^|[^A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(proj-|or-v1-)?[A-Za-z0-9_-]{20,}|sk_(live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|lin_api_[A-Za-z0-9]{20,}|re_[A-Za-z0-9]{20,}|ark-[A-Za-z0-9-]{20,})'

mapfile_command=(git grep -Il -E "$secret_pattern" --)
if matching_files="$("${mapfile_command[@]}" 2>/dev/null)" && [ -n "$matching_files" ]; then
  printf 'Files containing credential-shaped values:\n%s\n' "$matching_files" >&2
  status=1
fi

if private_key_files="$(git grep -Il -E -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' 2>/dev/null)" &&
  [ -n "$private_key_files" ]; then
  printf 'Files containing private keys:\n%s\n' "$private_key_files" >&2
  status=1
fi

exit "$status"
