#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
result_bundle_path="${RESULT_BUNDLE_PATH:-${TMPDIR:-/tmp}/talent-signal-remote-chat-e2e-$(date +%Y%m%d-%H%M%S).xcresult}"

cd "$repository_root"

echo "Remote chat E2E evidence: $result_bundle_path"

exec ./scripts/infisical/run.sh "${INFISICAL_ENVIRONMENT:-dev}" /shared -- \
  env \
  TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING=true \
  TALENT_SIGNAL_CHAT_PROVIDER=zhipu \
  TALENT_SIGNAL_CHAT_MODEL=glm-5.3 \
  TS_IOS_EXPECT_REMOTE_CHAT=true \
  RESULT_BUNDLE_PATH="$result_bundle_path" \
  IOS_ONLY_TESTING=TalentSignalUITests/CandidateSignalUITests/testCanonicalAskRendersTheBackendAnswer \
  ./scripts/ios/check.sh
