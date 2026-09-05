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
