#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_path="$repository_root/apps/ios/TalentSignal.xcodeproj"
scheme_name="TalentSignal"

cd "$repository_root"

xcodebuild \
  -project "$project_path" \
  -scheme "$scheme_name" \
  -configuration Release \
  -destination "generic/platform=iOS Simulator" \
  CODE_SIGNING_ALLOWED=NO \
  clean build

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

xcrun simctl boot "$simulator_id" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$simulator_id" -b

test_arguments=(
  -project "$project_path"
  -scheme "$scheme_name"
  -destination "platform=iOS Simulator,id=$simulator_id"
  -parallel-testing-enabled NO
)

if [ -n "${RESULT_BUNDLE_PATH:-}" ]; then
  mkdir -p "$(dirname "$RESULT_BUNDLE_PATH")"
  test_arguments+=(-resultBundlePath "$RESULT_BUNDLE_PATH")
fi

xcodebuild "${test_arguments[@]}" test
