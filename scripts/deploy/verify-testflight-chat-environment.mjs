#!/usr/bin/env node

import { verifySecretEnvironment } from "../verify-secret-environment.mjs";

export const TESTFLIGHT_CHAT_ADMISSION_NAME =
  "TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING";

export const TESTFLIGHT_CHAT_ENABLED_ENVIRONMENT_NAMES = [
  TESTFLIGHT_CHAT_ADMISSION_NAME,
  "TALENT_SIGNAL_CHAT_PROVIDER",
  "TALENT_SIGNAL_CHAT_MODEL",
  "ZHIPU_API_KEY",
];

function validOfficialBaseUrl(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "open.bigmodel.cn" &&
      parsed.pathname.replace(/\/+$/u, "") === "/api/paas/v4" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export function verifyTestflightChatEnvironment(environment) {
  const admission = environment[TESTFLIGHT_CHAT_ADMISSION_NAME]?.trim();
  const presence = verifySecretEnvironment(environment, [
    TESTFLIGHT_CHAT_ADMISSION_NAME,
  ]);
  const issues = [];

  if (admission !== "true" && admission !== "false") {
    issues.push("Remote Relationship Ask admission must be true or false.");
  }

  if (admission !== "true") {
    return {
      enabled: false,
      ok: presence.ok && admission === "false" && issues.length === 0,
      presence,
      issues,
    };
  }

  const enabledPresence = verifySecretEnvironment(
    environment,
    TESTFLIGHT_CHAT_ENABLED_ENVIRONMENT_NAMES,
  );
  if (environment.TALENT_SIGNAL_CHAT_PROVIDER?.trim() !== "zhipu") {
    issues.push("The TestFlight Relationship Ask provider must be zhipu.");
  }
  if (environment.TALENT_SIGNAL_CHAT_MODEL?.trim() !== "glm-5.3") {
    issues.push("The TestFlight Relationship Ask model must be pinned to glm-5.3.");
  }
  const configuredBaseUrl =
    environment.ZHIPU_BASE_URL?.trim() ||
    "https://open.bigmodel.cn/api/paas/v4";
  if (!validOfficialBaseUrl(configuredBaseUrl)) {
    issues.push("The configured Zhipu Chat endpoint is not allowlisted.");
  }
  const timeout = Number(
    environment.TALENT_SIGNAL_CHAT_TIMEOUT_MS?.trim() || "15000",
  );
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
    issues.push("The Zhipu Chat timeout must be between 1000 and 30000 ms.");
  }

  return {
    enabled: true,
    ok: enabledPresence.ok && issues.length === 0,
    presence: enabledPresence,
    issues,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verification = verifyTestflightChatEnvironment(process.env);
  for (const result of verification.presence.results) {
    console.log(`${result.name}: ${result.present ? "present" : "missing"}`);
  }
  for (const issue of verification.issues) {
    console.error(`TestFlight Relationship Ask configuration: ${issue}`);
  }
  if (verification.ok) {
    console.log(
      verification.enabled
        ? "TestFlight Relationship Ask is admitted, pinned, and allowlisted."
        : "TestFlight Relationship Ask is explicitly disabled.",
    );
  } else {
    process.exitCode = 1;
  }
}
