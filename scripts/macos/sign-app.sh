#!/usr/bin/env bash
# Sign nested Sparkle code inside-out; never use --deep as a signing shortcut.
set -euo pipefail
APP="${1:?Application bundle required}"
IDENTITY="${2:?Signing identity required}"
FRAMEWORK="$APP/Contents/Frameworks/Sparkle.framework"
[[ -d "$FRAMEWORK" ]] || { echo 'Sparkle framework missing' >&2; exit 1; }
OPTIONS=(--force --sign "$IDENTITY")
if [[ "$IDENTITY" != '-' ]]; then OPTIONS+=(--options runtime --timestamp); fi
for nested in XPCServices/Downloader.xpc XPCServices/Installer.xpc Updater.app Autoupdate; do
  codesign "${OPTIONS[@]}" --preserve-metadata=entitlements "$FRAMEWORK/Versions/B/$nested"
done
codesign "${OPTIONS[@]}" "$FRAMEWORK"
codesign "${OPTIONS[@]}" "$APP"
codesign --verify --deep --strict "$APP"
