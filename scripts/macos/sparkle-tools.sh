#!/usr/bin/env bash
# Pinned upstream tools. Never run an unverified moving release asset.
set -euo pipefail
: "${SPARKLE_TOOLS_DIR:?Set a task-owned tools directory}"
mkdir -p "$SPARKLE_TOOLS_DIR"
ARCHIVE="$SPARKLE_TOOLS_DIR/Sparkle-2.10.0.tar.xz"
if [[ ! -f "$ARCHIVE" ]]; then
  curl --fail --location --retry 3 --output "$ARCHIVE" https://github.com/sparkle-project/Sparkle/releases/download/2.10.0/Sparkle-2.10.0.tar.xz
fi
printf 'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c  %s\n' "$ARCHIVE" | shasum -a 256 -c -
tar -xf "$ARCHIVE" -C "$SPARKLE_TOOLS_DIR"
