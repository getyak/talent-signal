#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAPIBaseURL } from "./configure-build-environment.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export function repositoryContractVersion() {
  const constants = readFileSync(
    join(repositoryRoot, "packages/contracts/src/constants.ts"),
    "utf8",
  );
  const match = constants.match(
    /export const CONTRACT_VERSION = "([^"]+)" as const;/u,
  );
  if (!match) throw new Error("Cannot resolve the repository API contract version.");
  return match[1];
}

export function validateChallenge(challenge, expectedContractVersion, now = Date.now()) {
  if (
    !challenge ||
    challenge.contract_version !== expectedContractVersion ||
    typeof challenge.challenge_id !== "string" ||
    challenge.challenge_id.length === 0 ||
    typeof challenge.nonce !== "string" ||
    challenge.nonce.length === 0 ||
    typeof challenge.expires_at !== "string" ||
    !Number.isFinite(Date.parse(challenge.expires_at)) ||
    Date.parse(challenge.expires_at) <= now
  ) {
    throw new Error("Apple authentication challenge has an invalid or stale contract.");
  }
  return challenge;
}

function environmentFileFrom(argumentsList) {
  if (argumentsList.length === 0) return join(repositoryRoot, ".env");
  if (argumentsList.length === 2 && argumentsList[0] === "--env-file") {
    return resolve(argumentsList[1]);
  }
  throw new Error("Usage: probe-auth-backend.mjs [--env-file PATH]");
}

export async function probeAuthenticationBackend({
  baseURL,
  expectedContractVersion,
  fetchImplementation = fetch,
}) {
  const endpoint = new URL(
    "v1/auth/apple/challenges",
    `${baseURL.replace(/\/$/u, "")}/`,
  );
  const response = await fetchImplementation(endpoint, {
    body: JSON.stringify({ client_label: "ios-release-probe" }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 201) {
    throw new Error(
      `Apple authentication challenge returned HTTP ${response.status}.`,
    );
  }

  let challenge;
  try {
    challenge = await response.json();
  } catch {
    throw new Error("Apple authentication challenge did not return JSON.");
  }
  return validateChallenge(challenge, expectedContractVersion);
}

export async function main(argumentsList = process.argv.slice(2)) {
  const environmentFile = environmentFileFrom(argumentsList);
  const baseURL = loadAPIBaseURL({
    configuration: "Release",
    environmentFile,
  });
  await probeAuthenticationBackend({
    baseURL,
    expectedContractVersion: repositoryContractVersion(),
  });
  console.log(`Verified Apple authentication challenge at ${new URL(baseURL).host}.`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    await main();
  } catch (error) {
    console.error(`iOS authentication backend: ${error.message}`);
    process.exitCode = 1;
  }
}
