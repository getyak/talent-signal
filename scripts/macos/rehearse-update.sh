#!/usr/bin/env bash
# Isolated, synthetic old-to-new Sparkle rehearsal; never publishes or changes an installed product.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${MACOS_OUTPUT_DIR:?Use an empty task-owned rehearsal directory}"
: "${SPARKLE_TOOLS_DIR:?Run sparkle-tools.sh first}"
[[ ! -e "$MACOS_OUTPUT_DIR/installed" ]] || { echo 'Use a new rehearsal directory' >&2; exit 1; }
umask 077
mkdir -p "$MACOS_OUTPUT_DIR" "$MACOS_OUTPUT_DIR/installed" "$MACOS_OUTPUT_DIR/updates"
"$ROOT/scripts/macos/generate.sh"
xcodebuild -quiet -project "$ROOT/apps/macos/TalentSignalMac.xcodeproj" -scheme TalentSignalMac \
  -configuration Debug -destination 'platform=macOS' -derivedDataPath "$MACOS_OUTPUT_DIR/build" CODE_SIGNING_ALLOWED=NO build
# Ephemeral test key only: private bytes never enter logs, source or user Keychain.
cat > "$MACOS_OUTPUT_DIR/key.swift" <<'SWIFT'
import Foundation
import CryptoKit
let key = Curve25519.Signing.PrivateKey()
try key.rawRepresentation.base64EncodedString().write(toFile: CommandLine.arguments[1], atomically: true, encoding: .utf8)
try key.publicKey.rawRepresentation.base64EncodedString().write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8)
SWIFT
swift "$MACOS_OUTPUT_DIR/key.swift" "$MACOS_OUTPUT_DIR/private-key" "$MACOS_OUTPUT_DIR/public-key"
export MACOS_OUTPUT_DIR
for BUILD in 900001 900002; do
  APP="$MACOS_OUTPUT_DIR/installed/Talent Signal Rehearsal.app"
  if [[ "$BUILD" == 900002 ]]; then APP="$MACOS_OUTPUT_DIR/Talent Signal Rehearsal.app"; fi
  ditto "$MACOS_OUTPUT_DIR/build/Build/Products/Debug/TalentSignalMac.app" "$APP"
  python3 - "$APP/Contents/Info.plist" "$BUILD" <<'PY'
import os,plistlib,sys
p=sys.argv[1]
with open(p,'rb') as f: d=plistlib.load(f)
d.update(CFBundleIdentifier='com.talentsignal.macos.rehearsal', CFBundleName='Talent Signal Rehearsal',
         CFBundleDisplayName='Talent Signal Rehearsal', CFBundleVersion=sys.argv[2],
         CFBundleShortVersionString='0.2.'+str(int(sys.argv[2])-900000),
         SUPublicEDKey=open(os.environ['MACOS_OUTPUT_DIR']+'/public-key').read(),
         SUFeedURL='http://127.0.0.1:4398/appcast.xml', TalentSignalUpdateRehearsal=True)
with open(p,'wb') as f: plistlib.dump(d,f)
PY
  "$ROOT/scripts/macos/sign-app.sh" "$APP" -
  if [[ "$BUILD" == 900002 ]]; then ditto -c -k --keepParent "$APP" "$MACOS_OUTPUT_DIR/updates/Talent-Signal-Rehearsal.zip"; fi
done
"$SPARKLE_TOOLS_DIR/bin/generate_appcast" --ed-key-file "$MACOS_OUTPUT_DIR/private-key" --maximum-deltas 0 \
  --download-url-prefix http://127.0.0.1:4398/ "$MACOS_OUTPUT_DIR/updates"
"$SPARKLE_TOOLS_DIR/bin/sign_update" --ed-key-file "$MACOS_OUTPUT_DIR/private-key" --verify "$MACOS_OUTPUT_DIR/updates/appcast.xml"
printf 'Ready: %s/installed/Talent Signal Rehearsal.app\n' "$MACOS_OUTPUT_DIR"
