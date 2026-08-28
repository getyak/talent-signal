import assert from "node:assert/strict";
import test from "node:test";

import {
  TESTFLIGHT_CHAT_ENABLED_ENVIRONMENT_NAMES,
  verifyTestflightChatEnvironment,
} from "./verify-testflight-chat-environment.mjs";

function admittedEnvironment() {
  return {
    TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
    TALENT_SIGNAL_CHAT_PROVIDER: "zhipu",
    TALENT_SIGNAL_CHAT_MODEL: "glm-5.3",
    TALENT_SIGNAL_CHAT_TIMEOUT_MS: "15000",
    ZHIPU_API_KEY: "private-zhipu-key",
    ZHIPU_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
  };
}

test("accepts an admitted, pinned, official Zhipu configuration", () => {
  const verification = verifyTestflightChatEnvironment(admittedEnvironment());
  assert.equal(verification.ok, true);
  assert.equal(verification.enabled, true);
});

test("accepts an explicit fail-closed disabled state without a provider key", () => {
  const verification = verifyTestflightChatEnvironment({
    TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "false",
  });
  assert.equal(verification.ok, true);
  assert.equal(verification.enabled, false);
});

test("rejects enabled processing without the dedicated Zhipu key", () => {
  const environment = admittedEnvironment();
  delete environment.ZHIPU_API_KEY;
  const verification = verifyTestflightChatEnvironment(environment);
  assert.equal(verification.ok, false);
  assert.equal(
    verification.presence.results.find(({ name }) => name === "ZHIPU_API_KEY")
      ?.present,
    false,
  );
});

test("rejects model drift and an unallowlisted endpoint without leaking the key", () => {
  const environment = admittedEnvironment();
  environment.TALENT_SIGNAL_CHAT_MODEL = "glm-latest";
  environment.ZHIPU_BASE_URL = "https://example.invalid/api/paas/v4";
  const verification = verifyTestflightChatEnvironment(environment);
  assert.equal(verification.ok, false);
  assert.match(verification.issues.join(" "), /glm-5\.3/u);
  assert.match(verification.issues.join(" "), /not allowlisted/u);
  assert.equal(
    JSON.stringify(verification).includes(environment.ZHIPU_API_KEY),
    false,
  );
  assert.deepEqual(
    verification.presence.results.map(({ name }) => name),
    TESTFLIGHT_CHAT_ENABLED_ENVIRONMENT_NAMES,
  );
});
