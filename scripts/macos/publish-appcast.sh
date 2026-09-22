#!/usr/bin/env bash
# Publish only notarized artifacts after the immutable version release is available.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${MACOS_RELEASE_MODE:?}"
[[ "$MACOS_RELEASE_MODE" == signed ]] || { echo 'Only signed releases enter the update feed' >&2; exit 1; }
: "${MACOS_OUTPUT_DIR:?}"
: "${MACOS_SPARKLE_PRIVATE_KEY:?Sparkle signing key required}"
: "${SPARKLE_TOOLS_DIR:?}"
: "${RELEASE_TAG:?}"
: "${RELEASE_SHA:?}"
: "${MACOS_BUILD_NUMBER:?}"
CHANNEL="${MACOS_UPDATE_CHANNEL:-stable}"
case "$CHANNEL" in stable|preview) ;; *) echo 'Invalid update channel' >&2; exit 1;; esac
REPO=getyak/talent-signal
FEED_TAG=macos-updates
STAGING="$(mktemp -d "$MACOS_OUTPUT_DIR/appcast.XXXXXX")"
# A failed network/auth call is not an empty feed. Query successfully before creating it.
gh api --paginate --slurp "repos/$REPO/releases?per_page=100" > "$STAGING/releases.json"
EXISTS="$(python3 -c 'import json,sys; print(any(r["tag_name"]=="macos-updates" for page in json.load(open(sys.argv[1])) for r in page))' "$STAGING/releases.json")"
if [[ "$EXISTS" == True ]]; then
  gh release download "$FEED_TAG" --repo "$REPO" --pattern appcast.xml --dir "$STAGING"
  printf '%s' "$MACOS_SPARKLE_PRIVATE_KEY" | "$SPARKLE_TOOLS_DIR/bin/sign_update" --ed-key-file - --verify "$STAGING/appcast.xml"
  python3 "$ROOT/scripts/macos/validate-appcast.py" "$STAGING/appcast.xml" "$MACOS_BUILD_NUMBER" --before-build
fi
# A signed feed can preserve previous stable entries when a preview is published.
cp "$MACOS_OUTPUT_DIR"/*-signed.zip "$STAGING/"
for archive in "$STAGING"/*-signed.zip; do
  gh release view "$RELEASE_TAG" --repo "$REPO" --json body --jq .body > "${archive%.zip}.txt"
done
FLAGS=(--embed-release-notes --maximum-deltas 0 --maximum-versions 0 --download-url-prefix "https://github.com/$REPO/releases/download/$RELEASE_TAG/" --link "https://github.com/$REPO/releases/tag/$RELEASE_TAG")
if [[ "$CHANNEL" == preview ]]; then FLAGS+=(--channel preview); fi
printf '%s' "$MACOS_SPARKLE_PRIVATE_KEY" | "$SPARKLE_TOOLS_DIR/bin/generate_appcast" --ed-key-file - "${FLAGS[@]}" "$STAGING"
printf '%s' "$MACOS_SPARKLE_PRIVATE_KEY" | "$SPARKLE_TOOLS_DIR/bin/sign_update" --ed-key-file - --verify "$STAGING/appcast.xml"
python3 "$ROOT/scripts/macos/validate-appcast.py" "$STAGING/appcast.xml" "${MACOS_BUILD_NUMBER:?}"
if [[ "$EXISTS" == False ]]; then
  gh release create "$FEED_TAG" "$STAGING/appcast.xml" --repo "$REPO" --target "$RELEASE_SHA" --title 'macOS signed update feed' --notes 'Signed Sparkle feed. Download the versioned macOS release to install the app.' --latest=false
else
  gh release upload "$FEED_TAG" "$STAGING/appcast.xml" --repo "$REPO" --clobber
fi
# Read back the served asset and require byte identity before reporting publication.
mkdir "$STAGING/readback"
gh release download "$FEED_TAG" --repo "$REPO" --pattern appcast.xml --dir "$STAGING/readback"
cmp "$STAGING/appcast.xml" "$STAGING/readback/appcast.xml"
printf 'Verified signed macOS appcast publication (%s).\n' "$CHANNEL"
