#!/usr/bin/env bash
set -euo pipefail

# Resolve the comparison base SHA that has-ios-changes.sh should diff against.
#
# Emits a single SHA on stdout (or nothing), so callers can capture it and feed
# it directly into has-ios-changes.sh. An empty result makes that classifier
# fall back to "true" (require iOS checks), which is the fail-safe direction.

usage() {
  printf 'Usage: %s --event NAME --ref NAME --base SHA --head SHA [--trusted-tag TAG]\n' \
    "${0##*/}" >&2
}

event=""
ref=""
base=""
head=""
trusted_tag=""
seen_event=false
seen_ref=false
seen_base=false
seen_head=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --event)
      [[ $# -ge 2 ]] || { printf 'Missing value for --event\n' >&2; usage; exit 1; }
      event="$2"
      seen_event=true
      shift 2
      ;;
    --ref)
      [[ $# -ge 2 ]] || { printf 'Missing value for --ref\n' >&2; usage; exit 1; }
      ref="$2"
      seen_ref=true
      shift 2
      ;;
    --base)
      [[ $# -ge 2 ]] || { printf 'Missing value for --base\n' >&2; usage; exit 1; }
      base="$2"
      seen_base=true
      shift 2
      ;;
    --head)
      [[ $# -ge 2 ]] || { printf 'Missing value for --head\n' >&2; usage; exit 1; }
      head="$2"
      seen_head=true
      shift 2
      ;;
    --trusted-tag)
      [[ $# -ge 2 ]] || { printf 'Missing value for --trusted-tag\n' >&2; usage; exit 1; }
      trusted_tag="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$seen_event" != true || "$seen_ref" != true || "$seen_base" != true || "$seen_head" != true ]]; then
  printf 'Missing required argument\n' >&2
  usage
  exit 1
fi

# --head is accepted for interface parity with the workflow caller; base
# resolution never needs it. Reading it here keeps the parsed value intentional.
: "$head"

case "$event" in
  pull_request | merge_group | workflow_dispatch)
    printf '%s\n' "$base"
    ;;
  push)
    if [[ "$ref" == "refs/heads/main" && -n "$trusted_tag" ]]; then
      git rev-parse "${trusted_tag}^{commit}"
    fi
    ;;
  *) ;;
esac

exit 0
