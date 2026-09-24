#!/usr/bin/env node
// Read-only macOS release prerequisite diagnostic over injected environment
// names. It consumes no secret API, prints only fixed credential names and
// statuses, and never prints values or error text that can carry raw values.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUIRED_MACOS_NAMES = [
  "MACOS_CERTIFICATE_P12_BASE64",
  "MACOS_CERTIFICATE_PASSWORD",
  "MACOS_SIGNING_IDENTITY",
  "MACOS_SPARKLE_PUBLIC_KEY",
  "MACOS_SPARKLE_PRIVATE_KEY",
  "MACOS_NOTARY_KEY_ID",
  "MACOS_NOTARY_ISSUER_ID",
  "MACOS_NOTARY_PRIVATE_KEY",
];

export const NOTARY_ALIAS_NAMES = [
  "APP_STORE_CONNECT_API_KEY_CONTENT",
  "APP_STORE_CONNECT_API_KEY_ID",
  "APP_STORE_CONNECT_ISSUER_ID",
];

export const SIGNING_IDENTITY_PREFIX = "Developer ID Application:";

export function isValidSigningIdentity(value) {
  return typeof value === "string" && value.startsWith(SIGNING_IDENTITY_PREFIX);
}

export function isValidSparklePublicKey(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64") === value;
}

const TYPE_CHECKS = new Map([
  ["MACOS_SIGNING_IDENTITY", isValidSigningIdentity],
  ["MACOS_SPARKLE_PUBLIC_KEY", isValidSparklePublicKey],
]);

function isPresent(environment, name) {
  return (
    Object.prototype.hasOwnProperty.call(environment, name) &&
    typeof environment[name] === "string" &&
    environment[name].trim().length > 0
  );
}

export function nameStatus(environment, name) {
  if (!isPresent(environment, name)) return "missing";
  const check = TYPE_CHECKS.get(name);
  return check && !check(environment[name]) ? "invalid" : "present";
}

function notarizationSource(environment) {
  const notary = ["MACOS_NOTARY_KEY_ID", "MACOS_NOTARY_ISSUER_ID", "MACOS_NOTARY_PRIVATE_KEY"]
    .map((name) => nameStatus(environment, name));
  const aliases = NOTARY_ALIAS_NAMES.map((name) => nameStatus(environment, name));
  if (notary.every((status) => status === "present")) return "configured";
  if (notary.every((status) => status === "missing") && aliases.every((status) => status === "present")) {
    return "recoverable-aliases";
  }
  return [...notary, ...aliases].some((status) => status === "present") ? "partial" : "none";
}

export function assessReleasePrerequisites(environment) {
  const names = REQUIRED_MACOS_NAMES.map((name) => ({
    name,
    status: nameStatus(environment, name),
  }));
  const aliases = NOTARY_ALIAS_NAMES.map((name) => ({
    name,
    status: nameStatus(environment, name),
  }));
  const requiredStatuses = names.map(({ status }) => status);
  const configuration = requiredStatuses.every((status) => status === "present")
    ? "complete"
    : requiredStatuses.every((status) => status === "missing")
      ? "absent"
      : "partial";
  return {
    names,
    aliases,
    notarizationSource: notarizationSource(environment),
    configuration,
    ready: configuration === "complete",
  };
}

const NOTARIZATION_LINES = {
  configured:
    "notarization source: configured (MACOS_NOTARY_KEY_ID, MACOS_NOTARY_ISSUER_ID, MACOS_NOTARY_PRIVATE_KEY)",
  "recoverable-aliases":
    "notarization source: recoverable (APP_STORE_CONNECT_API_KEY_CONTENT, APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_ISSUER_ID) map to MACOS_NOTARY_PRIVATE_KEY, MACOS_NOTARY_KEY_ID, MACOS_NOTARY_ISSUER_ID; aliases alone never make configuration ready",
  partial: "notarization source: partial",
  none: "notarization source: none",
};

export function formatReport(report) {
  const lines = [
    "macOS release prerequisites: injected environment names only; values are never printed",
    ...report.names.map(({ name, status }) => `${name}: ${status}`),
    ...report.aliases.map(({ name, status }) => `${name}: ${status}`),
    NOTARIZATION_LINES[report.notarizationSource],
    `configuration: ${report.configuration}`,
    report.ready
      ? "ready: configuration ready (configuration proof only; signing, notarization, and update-feed publication stay unproven)"
      : "ready: not ready (required MACOS_* names missing or invalid; aliases, keychain state, or mocked providers never count)",
  ];
  return lines.join("\n");
}

export function runCli(environment) {
  try {
    const report = assessReleasePrerequisites(environment);
    return { output: formatReport(report), exitCode: report.ready ? 0 : 1 };
  } catch {
    return {
      output: "release-prerequisites: unexpected error (details redacted; values are never printed)",
      exitCode: 2,
    };
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output, exitCode } = runCli(process.env);
  console.log(output);
  process.exitCode = exitCode;
}
