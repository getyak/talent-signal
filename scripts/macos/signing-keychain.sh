#!/usr/bin/env bash
# CI-only ephemeral signing setup. Secrets arrive via scoped Infisical OIDC.
set -euo pipefail
: "${RUNNER_TEMP:?CI runner required}"
: "${GITHUB_ENV:?CI environment required}"
: "${MACOS_SPARKLE_PUBLIC_KEY:?Missing Sparkle public key}"
: "${MACOS_SPARKLE_PRIVATE_KEY:?Missing Sparkle private key}"
: "${MACOS_CERTIFICATE_P12_BASE64:?Missing Developer ID certificate}"
: "${MACOS_CERTIFICATE_PASSWORD:?Missing certificate password}"
: "${MACOS_NOTARY_KEY_ID:?Missing notary key ID}"
: "${MACOS_NOTARY_ISSUER_ID:?Missing notary issuer ID}"
: "${MACOS_NOTARY_PRIVATE_KEY:?Missing notary private key}"
umask 077
KEYCHAIN="$RUNNER_TEMP/talent-signal-macos.keychain-db"
CERT="$RUNNER_TEMP/macos-certificate.p12"
KEY="$RUNNER_TEMP/macos-notary.p8"
trap 'rm -f "$CERT" "$KEY"' EXIT
PASSWORD="$(openssl rand -hex 32)"
echo "::add-mask::$PASSWORD"
printf '%s' "$MACOS_CERTIFICATE_P12_BASE64" | base64 --decode > "$CERT"
printf '%s' "$MACOS_NOTARY_PRIVATE_KEY" > "$KEY"
security create-keychain -p "$PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$PASSWORD" "$KEYCHAIN"
security import "$CERT" -P "$MACOS_CERTIFICATE_PASSWORD" -k "$KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" login.keychain-db
xcrun notarytool store-credentials talent-signal-macos --key "$KEY" --key-id "$MACOS_NOTARY_KEY_ID" --issuer "$MACOS_NOTARY_ISSUER_ID" --keychain "$KEYCHAIN" >/dev/null
printf 'MACOS_NOTARY_PROFILE=talent-signal-macos\nMACOS_NOTARY_KEYCHAIN=%s\n' "$KEYCHAIN" >> "$GITHUB_ENV"
