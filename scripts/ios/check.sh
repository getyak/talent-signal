#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_path="$repository_root/apps/ios/TalentSignal.xcodeproj"
scheme_name="TalentSignal"

cd "$repository_root"

ios_derived_data_owned="false"
ios_derived_data="${IOS_DERIVED_DATA_PATH:-}"
if [ -z "$ios_derived_data" ]; then
  ios_derived_data="$(mktemp -d "${TMPDIR:-/tmp}/talent-signal-ios-check.XXXXXX")"
  ios_derived_data_owned="true"
fi

cleanup_ios_derived_data() {
  if [ "$ios_derived_data_owned" = "true" ] &&
    [ -n "$ios_derived_data" ] &&
    [ -d "$ios_derived_data" ]; then
    rm -rf -- "$ios_derived_data"
  fi
  return 0
}
trap cleanup_ios_derived_data EXIT

xcodebuild \
  -project "$project_path" \
  -scheme "$scheme_name" \
  -configuration Release \
  -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$ios_derived_data" \
  CODE_SIGNING_ALLOWED=NO \
  clean build

simulator_id="${IOS_SIMULATOR_ID:-}"
if [ -z "$simulator_id" ]; then
  simulator_id="$(
    xcrun simctl list devices available -j |
      ruby -rjson -e '
        devices = JSON.parse(STDIN.read).fetch("devices")
        ios_runtimes = devices.keys.grep(/iOS/).sort.reverse
        phone = ios_runtimes.flat_map { |runtime| devices.fetch(runtime) }
                            .find { |device| device.fetch("name").start_with?("iPhone") }
        abort("No available iPhone simulator found") unless phone
        print phone.fetch("udid")
      '
  )"
fi

# A long-lived Simulator can retain wedged accessibility and automation
# services after interrupted UI runs. Reboot it by default so the release gate
# starts from an observable device baseline. Set IOS_REBOOT_SIMULATOR=false
# only for an intentional live-debug session.
if [ "${IOS_REBOOT_SIMULATOR:-true}" = "true" ]; then
  xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
fi
xcrun simctl boot "$simulator_id" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$simulator_id" -b

# Keep the gate deterministic when a previous manual accessibility audit left
# the shared Simulator at a non-default Dynamic Type size or appearance. Tests
# that exercise AX5 and dark mode pass those settings as launch arguments, so
# this baseline does not weaken their coverage.
if [ "${IOS_PRESERVE_SIMULATOR_UI:-false}" != "true" ]; then
  xcrun simctl ui "$simulator_id" content_size large
  xcrun simctl ui "$simulator_id" appearance light
fi

ios_fixture_server_pid=""
ios_response_loss_proxy_pid=""
ios_text_signal_proxy_pid=""
ios_backend_started="false"
ios_check_project="talent-signal-ios-check-$$"

cleanup_ios_helpers() {
  for helper_pid in \
    "$ios_fixture_server_pid" \
    "$ios_response_loss_proxy_pid" \
    "$ios_text_signal_proxy_pid"; do
    if [ -n "$helper_pid" ]; then
      kill "$helper_pid" >/dev/null 2>&1 || true
      wait "$helper_pid" >/dev/null 2>&1 || true
    fi
  done
  if [ "$ios_backend_started" = "true" ]; then
    docker compose \
      --project-directory "$repository_root" \
      -p "$ios_check_project" \
      down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  cleanup_ios_derived_data
}
trap cleanup_ios_helpers EXIT

wait_for_url() {
  local url="$1"
  local attempt
  for ((attempt = 0; attempt < 40; attempt += 1)); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

free_loopback_port() {
  ruby -rsocket -e '
    server = TCPServer.new("127.0.0.1", 0)
    print server.addr[1]
    server.close
  '
}

ios_backend_url="${TS_IOS_BACKEND_URL:-}"
if [ -z "$ios_backend_url" ]; then
  if command -v docker >/dev/null 2>&1; then
    POSTGRES_PORT="$(free_loopback_port)"
    BACKEND_PORT="$(free_loopback_port)"
    export POSTGRES_PORT BACKEND_PORT
    export BACKEND_IMAGE="talent-signal-backend-local:$ios_check_project"
    ios_backend_started="true"
    docker compose \
      --project-directory "$repository_root" \
      -p "$ios_check_project" \
      up --build --wait
    ios_backend_url="http://127.0.0.1:$BACKEND_PORT"
  else
    ios_backend_url="http://127.0.0.1:4317"
    echo "Docker is unavailable; backend-dependent iOS journeys will skip." >&2
  fi
fi

ios_response_loss_proxy_port="$(free_loopback_port)"
ios_text_signal_proxy_port="$(free_loopback_port)"
ios_pursuit_fixture_port="$(free_loopback_port)"
export TS_IOS_BACKEND_URL="$ios_backend_url"
export TS_IOS_RESPONSE_LOSS_PROXY_URL="http://127.0.0.1:$ios_response_loss_proxy_port"
export TS_IOS_TEXT_SIGNAL_PROXY_URL="http://127.0.0.1:$ios_text_signal_proxy_port"
export TS_IOS_PURSUIT_FIXTURE_URL="http://127.0.0.1:$ios_pursuit_fixture_port"

if curl --fail --silent --show-error "$ios_backend_url/health/live" >/dev/null 2>&1; then
  if ! curl --fail --silent --show-error \
    "$TS_IOS_PURSUIT_FIXTURE_URL/health/live" >/dev/null 2>&1; then
    API_BASE_URL="$ios_backend_url" \
      IOS_PURSUIT_FIXTURE_PORT="$ios_pursuit_fixture_port" \
      pnpm --silent --filter @talent-signal/backend \
      fixture:ios-pursuit-proposal-server &
    ios_fixture_server_pid="$!"
    wait_for_url "$TS_IOS_PURSUIT_FIXTURE_URL/health/live"
  fi
  if ! curl --fail --silent --show-error \
    "$TS_IOS_RESPONSE_LOSS_PROXY_URL/__response_loss_proxy/state" >/dev/null 2>&1; then
    UPSTREAM_BASE_URL="$ios_backend_url" \
      RESPONSE_LOSS_PROXY_PORT="$ios_response_loss_proxy_port" \
      pnpm --silent --filter @talent-signal/backend \
      fixture:response-loss-proxy &
    ios_response_loss_proxy_pid="$!"
    wait_for_url "$TS_IOS_RESPONSE_LOSS_PROXY_URL/__response_loss_proxy/state"
  fi
  if ! curl --fail --silent --show-error \
    "$TS_IOS_TEXT_SIGNAL_PROXY_URL/__text_signal_proxy/state" >/dev/null 2>&1; then
    UPSTREAM_BASE_URL="$ios_backend_url" \
      TEXT_SIGNAL_PROXY_PORT="$ios_text_signal_proxy_port" \
      pnpm --silent --filter @talent-signal/backend \
      fixture:text-signal-proxy &
    ios_text_signal_proxy_pid="$!"
    wait_for_url "$TS_IOS_TEXT_SIGNAL_PROXY_URL/__text_signal_proxy/state"
  fi
  curl --fail --silent --show-error \
    --request POST \
    "$TS_IOS_TEXT_SIGNAL_PROXY_URL/__text_signal_proxy/online" >/dev/null
fi

test_arguments=(
  -project "$project_path"
  -scheme "$scheme_name"
  -destination "platform=iOS Simulator,id=$simulator_id"
  -derivedDataPath "$ios_derived_data"
  -parallel-testing-enabled NO
  "TS_IOS_BACKEND_URL=$TS_IOS_BACKEND_URL"
  "TS_IOS_RESPONSE_LOSS_PROXY_URL=$TS_IOS_RESPONSE_LOSS_PROXY_URL"
  "TS_IOS_TEXT_SIGNAL_PROXY_URL=$TS_IOS_TEXT_SIGNAL_PROXY_URL"
  "TS_IOS_PURSUIT_FIXTURE_URL=$TS_IOS_PURSUIT_FIXTURE_URL"
)

if [ -n "${IOS_ONLY_TESTING:-}" ]; then
  IFS=',' read -r -a ios_only_tests <<< "$IOS_ONLY_TESTING"
  for ios_only_test in "${ios_only_tests[@]}"; do
    test_arguments+=("-only-testing:$ios_only_test")
  done
  if [ -n "${RESULT_BUNDLE_PATH:-}" ]; then
    mkdir -p "$(dirname "$RESULT_BUNDLE_PATH")"
    test_arguments+=(-resultBundlePath "$RESULT_BUNDLE_PATH")
  fi
  xcodebuild "${test_arguments[@]}" test
  exit 0
fi

# Xcode 26's Simulator runner can be killed after several long UI journeys in
# one process even when those journeys pass independently. Build once, execute
# unit tests together, isolate every UI journey in a fresh runner, then merge
# the native result bundles into one auditable full-suite artifact.
xcodebuild "${test_arguments[@]}" build-for-testing

ios_result_parts_dir=""
ios_result_parts_owned="false"
if [ -n "${RESULT_BUNDLE_PATH:-}" ]; then
  mkdir -p "$(dirname "$RESULT_BUNDLE_PATH")"
  ios_result_parts_dir="${RESULT_BUNDLE_PATH%.xcresult}.parts"
  if [ -e "$RESULT_BUNDLE_PATH" ] || [ -e "$ios_result_parts_dir" ]; then
    echo "Result bundle output already exists: $RESULT_BUNDLE_PATH" >&2
    exit 2
  fi
  mkdir -p "$ios_result_parts_dir"
else
  ios_result_parts_dir="$(mktemp -d "${TMPDIR:-/tmp}/talent-signal-ios-results.XXXXXX")"
  ios_result_parts_owned="true"
fi

cleanup_ios_result_parts() {
  if [ "$ios_result_parts_owned" = "true" ] &&
    [ -n "$ios_result_parts_dir" ] &&
    [ -d "$ios_result_parts_dir" ]; then
    rm -rf -- "$ios_result_parts_dir"
  fi
}
trap 'cleanup_ios_result_parts; cleanup_ios_helpers' EXIT

declare -a ios_result_parts=()
ios_suite_failed="false"
ios_part_index=0

is_runner_bootstrap_failure() {
  local result_path="$1"
  [ -d "$result_path" ] || return 1
  xcrun xcresulttool get test-results summary \
    --path "$result_path" \
    --format json 2>/dev/null |
    ruby -rjson -e '
      result = JSON.parse(STDIN.read)
      failures = result.fetch("testFailures", [])
      only_failure = failures.length == 1 ? failures.first : {}
      bootstrap_failure = result.fetch("passedTests", 0).zero? &&
        result.fetch("skippedTests", 0).zero? &&
        only_failure.fetch("testName", "").include?("UITests-Runner encountered an error") &&
        only_failure.fetch("failureText", "").include?("before establishing connection")
      exit(bootstrap_failure ? 0 : 1)
    '
}

reboot_simulator_for_retry() {
  xcrun simctl shutdown "$simulator_id" >/dev/null 2>&1 || true
  xcrun simctl boot "$simulator_id" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$simulator_id" -b
}

run_ios_test_part() {
  local selector="$1"
  local part_label="$2"
  local -a part_arguments=("${test_arguments[@]}" "-only-testing:$selector")
  local part_path=""

  ios_part_index=$((ios_part_index + 1))
  part_path="$ios_result_parts_dir/$(printf '%03d' "$ios_part_index")-$part_label.xcresult"
  part_arguments+=(-resultBundlePath "$part_path")

  if xcodebuild "${part_arguments[@]}" test-without-building; then
    :
  elif is_runner_bootstrap_failure "$part_path"; then
    local infra_failure_dir="$ios_result_parts_dir/infra-failures"
    mkdir -p "$infra_failure_dir"
    mv "$part_path" "$infra_failure_dir/$(basename "$part_path")"
    echo "Retrying isolated iOS test after runner bootstrap failure: $selector" >&2
    reboot_simulator_for_retry
    if ! xcodebuild "${part_arguments[@]}" test-without-building; then
      ios_suite_failed="true"
    fi
  else
    ios_suite_failed="true"
  fi
  if [ -d "$part_path" ]; then
    ios_result_parts+=("$part_path")
  fi
}

run_ios_test_part "TalentSignalTests" "unit"

declare -a ios_ui_tests=()
ios_ui_test_list="$(mktemp "${TMPDIR:-/tmp}/talent-signal-ios-tests.XXXXXX")"
ruby -e '
  ARGV.each do |path|
    klass = nil
    File.foreach(path) do |line|
      klass = Regexp.last_match(1) if line =~ /final class ([A-Za-z0-9_]+): XCTestCase/
      if klass && line =~ /^\s+func (test[A-Za-z0-9_]+)\s*\(/
        puts "TalentSignalUITests/" + klass + "/" + Regexp.last_match(1)
      end
    end
  end
' "$repository_root"/apps/ios/UITests/*.swift > "$ios_ui_test_list"
while IFS= read -r ios_ui_test; do
  ios_ui_tests+=("$ios_ui_test")
done < "$ios_ui_test_list"
rm -f -- "$ios_ui_test_list"

if [ "${#ios_ui_tests[@]}" -eq 0 ]; then
  echo "No iOS UI tests were discovered." >&2
  exit 2
fi

for ios_ui_test in "${ios_ui_tests[@]}"; do
  run_ios_test_part "$ios_ui_test" "${ios_ui_test##*/}"
done

if [ -n "${RESULT_BUNDLE_PATH:-}" ]; then
  if [ "${#ios_result_parts[@]}" -lt 2 ]; then
    echo "Not enough result bundle parts were produced to merge." >&2
    exit 2
  fi
  xcrun xcresulttool merge \
    --output-path "$RESULT_BUNDLE_PATH" \
    "${ios_result_parts[@]}"
fi

if [ "$ios_suite_failed" = "true" ]; then
  exit 65
fi
