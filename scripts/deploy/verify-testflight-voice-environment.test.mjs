import assert from "node:assert/strict";
import test from "node:test";

import {
  TESTFLIGHT_VOICE_ENVIRONMENT_NAMES,
  verifyTestflightVoiceEnvironment,
} from "./verify-testflight-voice-environment.mjs";

function admittedEnvironment() {
  return {
    TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION: "true",
    VOICE_ASR_PROVIDER: "doubao",
    DOUBAO_ASR_APP_ID: "private-app-id",
    DOUBAO_ASR_ACCESS_TOKEN: "private-access-token",
    DOUBAO_ASR_BASE_URL: "https://openspeech.bytedance.com",
    DOUBAO_ASR_RESOURCE_ID: "volc.bigasr.auc_turbo",
  };
}

test("accepts the admitted allowlisted TestFlight voice configuration", () => {
  assert.equal(verifyTestflightVoiceEnvironment(admittedEnvironment()).ok, true);
});

test("fails closed without voice-specific admission", () => {
  const environment = admittedEnvironment();
  environment.TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION = "false";

  const verification = verifyTestflightVoiceEnvironment(environment);
  assert.equal(verification.ok, false);
  assert.match(verification.issues.join(" "), /not explicitly admitted/u);
});

test("rejects an unallowlisted provider origin without exposing credentials", () => {
  const environment = admittedEnvironment();
  environment.DOUBAO_ASR_BASE_URL = "https://example.invalid";

  const verification = verifyTestflightVoiceEnvironment(environment);
  assert.equal(verification.ok, false);
  assert.match(verification.issues.join(" "), /not allowlisted/u);
  assert.equal(
    JSON.stringify(verification).includes(environment.DOUBAO_ASR_ACCESS_TOKEN),
    false,
  );
  assert.deepEqual(
    verification.presence.results.map(({ name }) => name),
    TESTFLIGHT_VOICE_ENVIRONMENT_NAMES,
  );
});
