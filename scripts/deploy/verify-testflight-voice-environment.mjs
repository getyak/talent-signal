#!/usr/bin/env node

import { verifySecretEnvironment } from "../verify-secret-environment.mjs";

export const TESTFLIGHT_VOICE_ENVIRONMENT_NAMES = [
  "TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION",
  "VOICE_ASR_PROVIDER",
  "DOUBAO_ASR_APP_ID",
  "DOUBAO_ASR_ACCESS_TOKEN",
];

export function verifyTestflightVoiceEnvironment(environment) {
  const presence = verifySecretEnvironment(
    environment,
    TESTFLIGHT_VOICE_ENVIRONMENT_NAMES,
  );
  const issues = [];

  if (
    environment.TALENT_SIGNAL_ALLOW_REMOTE_VOICE_TRANSCRIPTION?.trim() !==
    "true"
  ) {
    issues.push("Remote recruiter dictation is not explicitly admitted.");
  }
  if (environment.VOICE_ASR_PROVIDER?.trim() !== "doubao") {
    issues.push("The TestFlight voice provider must be doubao.");
  }
  const configuredBaseURL = environment.DOUBAO_ASR_BASE_URL?.trim();
  if (configuredBaseURL) {
    try {
      const parsed = new URL(configuredBaseURL);
      if (
        parsed.origin !== "https://openspeech.bytedance.com" ||
        parsed.pathname !== "/" ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        issues.push("The configured Doubao ASR origin is not allowlisted.");
      }
    } catch {
      issues.push("The configured Doubao ASR origin is invalid.");
    }
  }
  const configuredResource = environment.DOUBAO_ASR_RESOURCE_ID?.trim();
  if (
    configuredResource &&
    configuredResource !== "volc.bigasr.auc_turbo"
  ) {
    issues.push("The configured Doubao ASR resource is not allowlisted.");
  }

  return {
    ok: presence.ok && issues.length === 0,
    presence,
    issues,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const verification = verifyTestflightVoiceEnvironment(process.env);
  for (const result of verification.presence.results) {
    console.log(`${result.name}: ${result.present ? "present" : "missing"}`);
  }
  for (const issue of verification.issues) {
    console.error(`TestFlight voice configuration: ${issue}`);
  }
  if (verification.ok) {
    console.log("TestFlight voice configuration is admitted and allowlisted.");
  } else {
    process.exitCode = 1;
  }
}
