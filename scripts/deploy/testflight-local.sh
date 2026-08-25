#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
testflight_env="${TS_TESTFLIGHT_ENV_FILE:-$repository_root/.env.testflight}"

if [[ ! -r "$testflight_env" ]]; then
  echo "TestFlight environment file is not readable: $testflight_env" >&2
  exit 1
fi

for command_name in curl docker node tailscale; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done

tailscale_state="$(tailscale status --json)"
tailscale_values="$(
  node -e '
    const state = JSON.parse(process.argv[1]);
    const backendState = state.BackendState ?? "";
    const hostname = (state.Self?.DNSName ?? "").replace(/\.$/u, "");
    console.log(`${backendState}|${hostname}`);
  ' "$tailscale_state"
)"
IFS='|' read -r tailscale_backend_state tailscale_hostname <<< "$tailscale_values"

if [[ "$tailscale_backend_state" != "Running" ]]; then
  echo "Tailscale must be connected before configuring TestFlight Serve." >&2
  exit 1
fi

if [[ -z "$tailscale_hostname" ]]; then
  echo "Tailscale did not report a MagicDNS hostname for this Mac." >&2
  exit 1
fi

configured_base_url="$(
  node --input-type=module - "$testflight_env" "$repository_root" <<'NODE'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [environmentFile, repositoryRoot] = process.argv.slice(2);
const moduleURL = pathToFileURL(
  `${repositoryRoot}/scripts/ios/configure-build-environment.mjs`,
);
const { readEnvironmentValue, validateAPIBaseURL } = await import(moduleURL);
const value = readEnvironmentValue(
  readFileSync(environmentFile, "utf8"),
  "TALENT_SIGNAL_API_BASE_URL",
);
console.log(validateAPIBaseURL(value, "Release"));
NODE
)"
expected_base_url="https://$tailscale_hostname"

if [[ "$configured_base_url" != "$expected_base_url" ]]; then
  echo "TALENT_SIGNAL_API_BASE_URL must match this Mac: $expected_base_url" >&2
  exit 1
fi

compose=(
  docker compose
  --project-name talent-signal-testflight-local
  --env-file "$testflight_env"
  --file "$repository_root/compose.testflight.yaml"
)

"${compose[@]}" config --quiet
if [[ "${TS_TESTFLIGHT_REBUILD:-true}" == "true" ]]; then
  BUILDKIT_PROGRESS=plain "${compose[@]}" build api
else
  echo "Reusing the configured local backend image."
fi
"${compose[@]}" up --detach --wait postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" up --detach --wait --remove-orphans api

published_endpoint="$("${compose[@]}" port api 4317)"
if [[ "$published_endpoint" != 127.0.0.1:* ]]; then
  echo "Refusing to expose an API that is not bound to Mac loopback." >&2
  exit 1
fi

tailscale serve --bg --yes "http://$published_endpoint"

curl --fail --silent --show-error \
  "http://$published_endpoint/health/ready" >/dev/null
direct_network=(
  env
  -u HTTP_PROXY
  -u HTTPS_PROXY
  -u ALL_PROXY
  -u http_proxy
  -u https_proxy
  -u all_proxy
  NODE_USE_ENV_PROXY=0
)
"${direct_network[@]}" node "$repository_root/scripts/ios/probe-auth-backend.mjs" \
  --env-file "$testflight_env"
curl --noproxy "$tailscale_hostname" --fail --silent --show-error \
  "$configured_base_url/health/live" >/dev/null

echo "Internal TestFlight API verified at $configured_base_url"
tailscale serve status
"${compose[@]}" ps
