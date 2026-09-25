import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  encodeAPIBaseURL,
  encodeEnvironmentProfiles,
  readEnvironmentValue,
  validateAPIBaseURL,
  validateWebOrigin,
  writeBuildEnvironment,
} from "./configure-build-environment.mjs";

test("reads the last exact dotenv key without evaluating shell content", () => {
  const marker = join(tmpdir(), `talent-signal-env-marker-${process.pid}`);
  const contents = [
    `UNRELATED=$(touch ${marker})`,
    "TALENT_SIGNAL_API_BASE_URL=http://127.0.0.1:4317",
    "TALENT_SIGNAL_API_BASE_URL='http://localhost:4318'",
  ].join("\n");

  assert.equal(
    readEnvironmentValue(contents, "TALENT_SIGNAL_API_BASE_URL"),
    "http://localhost:4318",
  );
  assert.throws(() => readFileSync(marker));
});

test("enforces Release HTTPS and exact Debug loopback HTTP", () => {
  assert.equal(
    validateAPIBaseURL("https://api.example.test/", "Release"),
    "https://api.example.test",
  );
  assert.equal(
    validateAPIBaseURL("http://127.0.0.1:4317", "Debug"),
    "http://127.0.0.1:4317",
  );
  assert.throws(
    () => validateAPIBaseURL("http://127.0.0.1:4317", "Release"),
    /must use HTTPS/u,
  );
  assert.throws(
    () => validateAPIBaseURL("http://example.test", "Debug"),
    /exact loopback/u,
  );
  assert.throws(
    () => validateAPIBaseURL("https://api.example.test?token=value", "Release"),
    /query/u,
  );
  assert.throws(
    () => validateAPIBaseURL("https://api.example.test?", "Release"),
    /query/u,
  );
  assert.throws(
    () => validateAPIBaseURL("https://api.example.test#", "Release"),
    /fragment/u,
  );
});

test("process environment overrides dotenv and writes an xcconfig-safe value", () => {
  const directory = mkdtempSync(join(tmpdir(), "talent-signal-ios-env-"));
  const environmentFile = join(directory, ".env");
  const outputFile = join(directory, "Environment.local.xcconfig");

  try {
    writeFileSync(
      environmentFile,
      "TALENT_SIGNAL_API_BASE_URL=https://file.example.test\n",
    );
    const selected = writeBuildEnvironment({
      allowMissing: false,
      configuration: "Release",
      environment: {
        TALENT_SIGNAL_API_BASE_URL: "https://process.example.test/A~",
      },
      environmentFile,
      outputFile,
    });

    assert.equal(selected, "https://process.example.test/A~");
    const generated = readFileSync(outputFile, "utf8");
    assert.match(
      generated,
      new RegExp(
        `TALENT_SIGNAL_API_BASE_URL_BASE64URL = ${encodeAPIBaseURL(selected)}`,
        "u",
      ),
    );
    assert.match(encodeAPIBaseURL(selected), /^[A-Za-z0-9_-]+$/u);
    assert.doesNotMatch(generated, /https:\/\//u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("allow-missing removes stale generated configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "talent-signal-ios-env-"));
  const outputFile = join(directory, "Environment.local.xcconfig");

  try {
    writeFileSync(outputFile, "stale\n");
    const selected = writeBuildEnvironment({
      allowMissing: true,
      configuration: "Debug",
      environment: {},
      environmentFile: join(directory, "absent.env"),
      outputFile,
    });

    assert.equal(selected, null);
    assert.throws(() => readFileSync(outputFile));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("account recovery accepts only a trusted origin with configuration-specific transport", () => {
  assert.equal(validateWebOrigin(undefined, "Release"), "");
  assert.equal(validateWebOrigin("https://web.example.test:10443/", "Release"), "https://web.example.test:10443");
  assert.equal(validateWebOrigin("http://127.0.0.1:4608", "Debug"), "http://127.0.0.1:4608");
  for (const value of [
    "https://web.example.test/workspace",
    "https://web.example.test/?token=secret",
    "https://web.example.test/#fragment",
    "https://user:secret@web.example.test",
    "http://127.0.0.1:4608",
    "javascript:alert(1)",
  ]) assert.throws(() => validateWebOrigin(value, "Release"));
  assert.throws(() => validateWebOrigin("http://127.0.0.1.example.test", "Debug"));
});

test("web origin configuration is encoded, explicit environment wins, and absence removes stale values", () => {
  const directory = mkdtempSync(join(tmpdir(), "talent-signal-ios-web-origin-"));
  const environmentFile = join(directory, ".env");
  const outputFile = join(directory, "Environment.local.xcconfig");
  const build = (environment) => writeBuildEnvironment({
    allowMissing: false, configuration: "Release", environment,
    environmentFile, outputFile,
  });
  const readWeb = () => {
    const encoded = readFileSync(outputFile, "utf8").match(/^TALENT_SIGNAL_WEB_ORIGIN_BASE64URL = (.*)$/mu)[1];
    return Buffer.from(encoded, "base64url").toString("utf8");
  };
  try {
    writeFileSync(environmentFile, "TALENT_SIGNAL_API_BASE_URL=https://api.example.test\nTALENT_SIGNAL_WEB_ORIGIN=https://file.example.test\n");
    build({});
    assert.equal(readWeb(), "https://file.example.test");
    build({ TALENT_SIGNAL_WEB_ORIGIN: "https://process.example.test" });
    assert.equal(readWeb(), "https://process.example.test");
    assert.doesNotMatch(readFileSync(outputFile, "utf8"), /https:\/\//u);
    build({ TALENT_SIGNAL_WEB_ORIGIN: "" });
    assert.equal(readWeb(), "");
    writeFileSync(environmentFile, "TALENT_SIGNAL_API_BASE_URL=https://api.example.test\n");
    build({});
    assert.equal(readWeb(), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("approved runtime profiles pin identity and cannot carry credentials or duplicate targets", () => {
  const profile = { id: "staging", name: "Staging", endpoint: "https://staging.example.test/", expectedDeploymentID: "deploy-17" };
  const encode = (items, configuration = "Release") => encodeEnvironmentProfiles(JSON.stringify(items), configuration);
  const decoded = JSON.parse(Buffer.from(encode([profile]), "base64url").toString("utf8"));
  assert.equal(decoded[0].endpoint, "https://staging.example.test");
  assert.throws(() => encode([{ ...profile, accessToken: "must-not-embed" }]), /extra fields/u);
  assert.throws(() => encode([{ ...profile, expectedDeploymentID: "" }]), /expectedDeploymentID/u);
  assert.throws(() => encode([profile, { ...profile, id: "duplicate" }]), /unique/u);
  assert.throws(() => encode([{ ...profile, endpoint: "http://127.0.0.1:4317" }]), /HTTPS/u);
  assert.ok(encode([{ ...profile, endpoint: "http://127.0.0.1:4317" }], "Debug"));
});
