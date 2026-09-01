#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAC_APP_DIR="$REPOSITORY_ROOT/apps/macos"
DERIVED_DATA="$(mktemp -d "${TMPDIR:-/tmp}/talent-signal-macos.XXXXXX")"

cleanup() {
  rm -rf "$DERIVED_DATA"
}
trap cleanup EXIT

"$REPOSITORY_ROOT/scripts/macos/generate.sh"

node --test "$REPOSITORY_ROOT/scripts/macos/summarize-companion-trials.test.mjs"

xcodebuild \
  -quiet \
  -project "$MAC_APP_DIR/TalentSignalMac.xcodeproj" \
  -scheme TalentSignalMac \
  -destination "platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build

xcodebuild \
  -quiet \
  -project "$MAC_APP_DIR/TalentSignalMac.xcodeproj" \
  -scheme TalentSignalMac \
  -destination "platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  -only-testing:TalentSignalMacTests \
  test

xcodebuild \
  -quiet \
  -project "$MAC_APP_DIR/TalentSignalMac.xcodeproj" \
  -scheme TalentSignalMac \
  -destination "platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build-for-testing

if [[ "${RUN_MACOS_UI_TESTS:-0}" == "1" ]]; then
  xcodebuild \
    -quiet \
    -project "$MAC_APP_DIR/TalentSignalMac.xcodeproj" \
    -scheme TalentSignalMac \
    -destination "platform=macOS" \
    -derivedDataPath "$DERIVED_DATA" \
    CODE_SIGNING_ALLOWED=NO \
    -only-testing:TalentSignalMacUITests \
    test-without-building
else
  echo "macOS UI tests compiled. Set RUN_MACOS_UI_TESTS=1 on a host that has approved XCTest UI Automation to execute them."
fi
