#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const defaultEnvironmentFile = join(repositoryRoot, ".env");
const defaultOutputFile = join(
  repositoryRoot,
  "apps/ios/Config/Environment.local.xcconfig",
);

function parseQuotedValue(rawValue, quote, lineNumber) {
  if (!rawValue.endsWith(quote)) {
    throw new Error(`Unterminated quoted value on .env line ${lineNumber}.`);
  }

  const inner = rawValue.slice(1, -1);
  if (quote === "'") return inner;

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error(`Invalid double-quoted value on .env line ${lineNumber}.`);
  }
}

export function readEnvironmentValue(contents, key) {
  let selected;

  for (const [index, line] of contents.split(/\r?\n/u).entries()) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u,
    );
    if (!match || match[1] !== key) continue;

    let rawValue = match[2].trim();
    if (rawValue.startsWith("\"") || rawValue.startsWith("'")) {
      rawValue = parseQuotedValue(rawValue, rawValue[0], index + 1);
    } else {
      rawValue = rawValue.replace(/\s+#.*$/u, "").trim();
    }
    selected = rawValue;
  }

  return selected;
}

export function validateAPIBaseURL(value, configuration) {
  if (!value) {
    throw new Error("TALENT_SIGNAL_API_BASE_URL is required.");
  }
  if (!new Set(["Debug", "Release"]).has(configuration)) {
    throw new Error(`Unsupported iOS configuration: ${configuration}.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TALENT_SIGNAL_API_BASE_URL must be an absolute URL.");
  }

  if (
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href.includes("?") ||
    url.href.includes("#")
  ) {
    throw new Error(
      "TALENT_SIGNAL_API_BASE_URL cannot contain credentials, a query, or a fragment.",
    );
  }

  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  const isPermitted =
    url.protocol === "https:" ||
    (configuration === "Debug" &&
      url.protocol === "http:" &&
      loopbackHosts.has(url.hostname));
  if (!isPermitted) {
    throw new Error(
      configuration === "Release"
        ? "Release TALENT_SIGNAL_API_BASE_URL must use HTTPS."
        : "Debug HTTP is allowed only for an exact loopback host.",
    );
  }

  return url.toString().replace(/\/$/u, "");
}

export function loadAPIBaseURL({
  configuration,
  environment = process.env,
  environmentFile = defaultEnvironmentFile,
}) {
  const fileValue = existsSync(environmentFile)
    ? readEnvironmentValue(
        readFileSync(environmentFile, "utf8"),
        "TALENT_SIGNAL_API_BASE_URL",
      )
    : undefined;
  const selected = environment.TALENT_SIGNAL_API_BASE_URL?.trim() || fileValue;
  return validateAPIBaseURL(selected, configuration);
}

export function encodeAPIBaseURL(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function encodeEnvironmentProfiles(value, configuration) {
  if (!value?.trim()) return "";
  let profiles;
  try { profiles = JSON.parse(value); } catch { throw new Error("Environment profiles must be a JSON array."); }
  if (!Array.isArray(profiles) || profiles.length > 12) throw new Error("Supply at most 12 approved environment profiles.");
  const ids = new Set(["build-default"]);
  const endpoints = new Set();
  const normalized = profiles.map((profile) => {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)
      || Object.keys(profile).some((key) => !["id", "name", "endpoint", "expectedDeploymentID"].includes(key))
      || typeof profile.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(profile.id)
      || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 80
      || typeof profile.expectedDeploymentID !== "string" || !profile.expectedDeploymentID.trim()
      || profile.expectedDeploymentID.length > 160 || typeof profile.endpoint !== "string") {
      throw new Error("Each approved profile requires an id, name, endpoint and expectedDeploymentID; secrets and extra fields are not allowed.");
    }
    const endpoint = validateAPIBaseURL(profile.endpoint, configuration);
    if (ids.has(profile.id) || endpoints.has(endpoint)) throw new Error("Environment ids and endpoints must be unique.");
    ids.add(profile.id); endpoints.add(endpoint);
    return { id: profile.id, name: profile.name.trim(), endpoint, expectedDeploymentID: profile.expectedDeploymentID.trim() };
  });
  return Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
}

function parseArguments(argumentsList) {
  const options = {
    allowMissing: false,
    configuration: "Debug",
    environmentFile: defaultEnvironmentFile,
    outputFile: defaultOutputFile,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--allow-missing") {
      options.allowMissing = true;
    } else if (argument === "--configuration") {
      options.configuration = argumentsList[++index];
    } else if (argument === "--env-file") {
      options.environmentFile = resolve(argumentsList[++index]);
    } else if (argument === "--output") {
      options.outputFile = resolve(argumentsList[++index]);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

export function writeBuildEnvironment({
  allowMissing,
  configuration,
  environment = process.env,
  environmentFile,
  outputFile,
}) {
  let baseURL;
  try {
    baseURL = loadAPIBaseURL({ configuration, environment, environmentFile });
  } catch (error) {
    if (!allowMissing || !/ is required\.$/u.test(error.message)) throw error;
    rmSync(outputFile, { force: true });
    return null;
  }

  const profileSource = environment.TALENT_SIGNAL_ENVIRONMENT_PROFILES_JSON
    ?? (existsSync(environmentFile ?? defaultEnvironmentFile)
      ? readEnvironmentValue(readFileSync(environmentFile ?? defaultEnvironmentFile, "utf8"), "TALENT_SIGNAL_ENVIRONMENT_PROFILES_JSON") : undefined);
  const profiles = encodeEnvironmentProfiles(profileSource, configuration);
  const contents = [
    "// Generated by scripts/ios/configure-build-environment.mjs. Do not edit.",
    `TALENT_SIGNAL_API_BASE_URL_BASE64URL = ${encodeAPIBaseURL(baseURL)}`,
    `TALENT_SIGNAL_ENVIRONMENT_PROFILES_BASE64URL = ${profiles}`,
    "",
  ].join("\n");
  mkdirSync(dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, contents, { mode: 0o600 });
  renameSync(temporaryFile, outputFile);
  return baseURL;
}

export function main(argumentsList = process.argv.slice(2)) {
  const options = parseArguments(argumentsList);
  const baseURL = writeBuildEnvironment(options);
  if (baseURL) {
    console.log(
      `Configured ${options.configuration} iOS API host: ${new URL(baseURL).host}`,
    );
  } else {
    console.log(
      "No local iOS API URL configured; Debug fixture and preview routes remain available.",
    );
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main();
  } catch (error) {
    console.error(`iOS build environment: ${error.message}`);
    process.exitCode = 1;
  }
}
