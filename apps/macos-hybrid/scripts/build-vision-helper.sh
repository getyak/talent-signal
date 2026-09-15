#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
host_triple=$(rustc -vV | awk '/^host:/ { print $2 }')
output="$app_dir/src-tauri/binaries/talent-signal-vision-$host_triple"

mkdir -p "$app_dir/src-tauri/binaries"
xcrun --sdk macosx swiftc \
  -O \
  -framework AppKit \
  -framework Vision \
  "$app_dir/src-tauri/vision-helper/main.swift" \
  -o "$output"
chmod 0755 "$output"
/usr/bin/codesign --force --sign - --timestamp=none "$output"
/usr/bin/codesign --verify --strict "$output"
