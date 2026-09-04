#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createAppStoreConnectToken } from "./manage-ios-signing-profiles.mjs";

const API_BASE = "https://api.appstoreconnect.apple.com";
const APP_IDENTIFIER = "com.talentsignal.app";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 80 * 60_000;
const FAILURE_STATES = new Set(["FAILED", "INVALID"]);

export class PermanentAppStoreConnectError extends Error {}

function uploadState(upload) {
  return upload?.attributes?.state?.state ?? "UNKNOWN";
}

function stateMessages(upload) {
  const state = upload?.attributes?.state ?? {};
  return ["errors", "warnings", "infos"]
    .flatMap((key) => Array.isArray(state[key]) ? state[key] : [])
    .map((detail) => {
      const code = detail?.code;
      const description = detail?.description ?? detail?.message;
      if (code && description) return `${code}: ${description}`;
      return description ?? code;
    })
    .filter(Boolean)
    .slice(0, 10);
}

function assertUploadCanBecomeValid(upload, { buildNumber, releaseVersion }) {
  if (upload.uploadState === "FAILED") {
    const detail = upload.messages.length > 0
      ? `: ${upload.messages.join(" | ")}`
      : "";
    throw new PermanentAppStoreConnectError(
      `App Store Connect rejected ${releaseVersion} (${buildNumber})${detail}`,
    );
  }
  if (FAILURE_STATES.has(upload.buildProcessingState)) {
    throw new PermanentAppStoreConnectError(
      `App Store Connect build processing ended in ${upload.buildProcessingState} for ${releaseVersion} (${buildNumber})`,
    );
  }
}

export function selectExactBuildUpload(document, { buildNumber, releaseVersion }) {
  const candidates = (document?.data ?? []).filter((upload) =>
    upload?.attributes?.cfBundleVersion === buildNumber &&
    upload?.attributes?.cfBundleShortVersionString === releaseVersion &&
    upload?.attributes?.platform === "IOS"
  );

  if (candidates.length > 1) {
    throw new PermanentAppStoreConnectError(
      `Expected at most one iOS build upload for ${releaseVersion} (${buildNumber}); found ${candidates.length}`,
    );
  }
  if (candidates.length === 0) return null;

  const upload = candidates[0];
  const buildID = upload?.relationships?.build?.data?.id;
  const build = (document?.included ?? []).find(
    (item) => item?.type === "builds" && item?.id === buildID,
  );

  return {
    buildID: build?.id ?? null,
    buildNumber,
    buildProcessingState: build?.attributes?.processingState ?? null,
    messages: stateMessages(upload),
    releaseVersion,
    uploadID: upload.id,
    uploadedDate: upload?.attributes?.uploadedDate ?? null,
    uploadState: uploadState(upload),
  };
}

export async function waitForTestFlightBuild({
  buildNumber,
  lookup,
  now = Date.now,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  releaseVersion,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const deadline = now() + timeoutMs;
  let lastObservedState = "not visible";

  while (true) {
    try {
      const upload = await lookup();
      if (upload) {
        lastObservedState = upload.buildProcessingState
          ? `${upload.uploadState}/${upload.buildProcessingState}`
          : upload.uploadState;
        assertUploadCanBecomeValid(upload, { buildNumber, releaseVersion });
        if (upload.uploadState === "COMPLETE" && upload.buildProcessingState === "VALID") {
          return upload;
        }
      }
    } catch (error) {
      if (error instanceof PermanentAppStoreConnectError) throw error;
      console.warn(`::notice::Transient App Store Connect lookup failed; retrying: ${error.message}`);
    }

    if (now() >= deadline) {
      throw new Error(
        `Timed out waiting for TestFlight ${releaseVersion} (${buildNumber}); last state: ${lastObservedState}`,
      );
    }

    console.log(
      `Waiting for TestFlight ${releaseVersion} (${buildNumber}); current state: ${lastObservedState}`,
    );
    await sleep(pollIntervalMs);
  }
}

async function apiRequest(token, path, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const message = `App Store Connect GET ${path.split("?")[0]} failed (${response.status})`;
    if (response.status !== 429 && response.status < 500) {
      throw new PermanentAppStoreConnectError(message);
    }
    throw new Error(message);
  }
  return response.json();
}

async function resolveAppID(token) {
  const query = new URLSearchParams({
    "filter[bundleId]": APP_IDENTIFIER,
    "fields[apps]": "bundleId,name",
    limit: "10",
  });
  const document = await apiRequest(token, `/v1/apps?${query}`);
  if (document.data?.length !== 1) {
    throw new PermanentAppStoreConnectError(
      `Expected exactly one App Store Connect app for ${APP_IDENTIFIER}; found ${document.data?.length ?? 0}`,
    );
  }
  return document.data[0].id;
}

async function fetchExactBuildUpload(token, appID, releaseVersion, buildNumber) {
  const query = new URLSearchParams({
    "fields[buildUploads]": "cfBundleShortVersionString,cfBundleVersion,platform,state,uploadedDate,build",
    "fields[builds]": "version,processingState,uploadedDate,usesNonExemptEncryption",
    "filter[cfBundleShortVersionString]": releaseVersion,
    "filter[cfBundleVersion]": buildNumber,
    "filter[platform]": "IOS",
    include: "build",
    limit: "10",
  });
  const document = await apiRequest(token, `/v1/apps/${appID}/buildUploads?${query}`);
  return selectExactBuildUpload(document, { buildNumber, releaseVersion });
}

async function main() {
  const buildNumber = process.env.BUILD_NUMBER?.trim();
  const releaseVersion = process.env.RELEASE_VERSION?.trim();
  if (!/^\d+$/.test(buildNumber ?? "")) {
    throw new PermanentAppStoreConnectError("BUILD_NUMBER must contain only digits");
  }
  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion ?? "")) {
    throw new PermanentAppStoreConnectError("RELEASE_VERSION must use semantic version format");
  }

  const privateKey = readFileSync(process.env.APP_STORE_CONNECT_API_KEY_PATH, "utf8");
  const keyID = process.env.APP_STORE_CONNECT_API_KEY_ID;
  const issuerID = process.env.APP_STORE_CONNECT_ISSUER_ID;
  if (!keyID || !issuerID) {
    throw new PermanentAppStoreConnectError(
      "APP_STORE_CONNECT_API_KEY_ID and APP_STORE_CONNECT_ISSUER_ID are required",
    );
  }
  let appID;

  const token = () => createAppStoreConnectToken({
    issuerId: issuerID,
    keyId: keyID,
    privateKey,
  });
  token();
  const lookup = async () => {
    appID ??= await resolveAppID(token());
    return fetchExactBuildUpload(token(), appID, releaseVersion, buildNumber);
  };

  const lookupMode = process.env.TESTFLIGHT_LOOKUP_MODE ?? "wait";
  if (!new Set(["probe", "wait"]).has(lookupMode)) {
    throw new PermanentAppStoreConnectError(
      "TESTFLIGHT_LOOKUP_MODE must be either probe or wait",
    );
  }
  if (lookupMode === "probe") {
    const upload = await lookup();
    if (!upload) {
      console.log(`No existing TestFlight upload for ${releaseVersion} (${buildNumber})`);
      return 2;
    }
    assertUploadCanBecomeValid(upload, { buildNumber, releaseVersion });
    console.log(
      `Found existing TestFlight upload for ${releaseVersion} (${buildNumber}): ${upload.uploadState}`,
    );
    return 0;
  }

  const timeoutMinutes = Number(process.env.TESTFLIGHT_PROCESSING_TIMEOUT_MINUTES ?? "80");
  const pollSeconds = Number(process.env.TESTFLIGHT_POLL_SECONDS ?? "30");
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    throw new PermanentAppStoreConnectError(
      "TESTFLIGHT_PROCESSING_TIMEOUT_MINUTES must be a positive number",
    );
  }
  if (!Number.isFinite(pollSeconds) || pollSeconds <= 0) {
    throw new PermanentAppStoreConnectError(
      "TESTFLIGHT_POLL_SECONDS must be a positive number",
    );
  }
  const upload = await waitForTestFlightBuild({
    buildNumber,
    lookup,
    pollIntervalMs: pollSeconds * 1_000,
    releaseVersion,
    timeoutMs: timeoutMinutes * 60_000,
  });
  console.log(
    `TestFlight processed ${releaseVersion} (${buildNumber}); upload ${upload.uploadID}, build ${upload.buildID}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
