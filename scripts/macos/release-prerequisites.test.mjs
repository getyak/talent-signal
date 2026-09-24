import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assessReleasePrerequisites,
  formatReport,
  isValidSigningIdentity,
  isValidSparklePublicKey,
  nameStatus,
  runCli,
} from "./release-prerequisites.mjs";

const cliPath = fileURLToPath(new URL("./release-prerequisites.mjs", import.meta.url));

const validPublicKey = Buffer.alloc(32).toString("base64");

function completeEnvironment(overrides = {}) {
  return {
    MACOS_CERTIFICATE_P12_BASE64: Buffer.from("fixture-p12").toString("base64"),
    MACOS_CERTIFICATE_PASSWORD: "fixture-certificate-password",
    MACOS_SIGNING_IDENTITY: "Developer ID Application: Fixture Owner (ABC1234567)",
    MACOS_SPARKLE_PUBLIC_KEY: validPublicKey,
    MACOS_SPARKLE_PRIVATE_KEY: "fixture-sparkle-private-key",
    MACOS_NOTARY_KEY_ID: "FIXTUREKEYID",
    MACOS_NOTARY_ISSUER_ID: "fixture-issuer-id",
    MACOS_NOTARY_PRIVATE_KEY: "fixture-notary-private-key",
    ...overrides,
  };
}

function without(environment, ...names) {
  const remaining = { ...environment };
  for (const name of names) delete remaining[name];
  return remaining;
}

const legacyTriplet = {
  APP_STORE_CONNECT_API_KEY_CONTENT: "fixture-legacy-private-key",
  APP_STORE_CONNECT_API_KEY_ID: "FIXTURELEGACYID",
  APP_STORE_CONNECT_ISSUER_ID: "fixture-legacy-issuer",
};

test("correct complete configuration reports ready and exits zero", () => {
  const report = assessReleasePrerequisites(completeEnvironment());

  assert.equal(report.configuration, "complete");
  assert.equal(report.notarizationSource, "configured");
  assert.equal(report.ready, true);
  assert.equal(runCli(completeEnvironment()).exitCode, 0);
  for (const { name, status } of report.names) {
    assert.equal(status, "present", name);
  }
});

test("partial configuration stays not ready and exits nonzero", () => {
  const report = assessReleasePrerequisites(
    without(completeEnvironment(), "MACOS_CERTIFICATE_P12_BASE64", "MACOS_NOTARY_PRIVATE_KEY"),
  );

  assert.equal(report.configuration, "partial");
  assert.equal(report.ready, false);
  assert.equal(runCli({ MACOS_SIGNING_IDENTITY: "Developer ID Application: Fixture (A)" }).exitCode, 1);
});

test("all missing names report absent configuration", () => {
  const report = assessReleasePrerequisites({});

  assert.equal(report.configuration, "absent");
  assert.equal(report.notarizationSource, "none");
  assert.equal(report.ready, false);
  assert.equal(runCli({}).exitCode, 1);
});

test("full legacy APP_STORE_CONNECT triplet is discovered as recoverable notarization source", () => {
  const report = assessReleasePrerequisites({ ...legacyTriplet });
  const output = formatReport(report);

  assert.equal(report.configuration, "absent");
  assert.equal(report.notarizationSource, "recoverable-aliases");
  assert.equal(report.ready, false);
  assert.equal(runCli({ ...legacyTriplet }).exitCode, 1);
  for (const name of [
    "APP_STORE_CONNECT_API_KEY_CONTENT",
    "APP_STORE_CONNECT_API_KEY_ID",
    "APP_STORE_CONNECT_ISSUER_ID",
    "MACOS_NOTARY_PRIVATE_KEY",
    "MACOS_NOTARY_KEY_ID",
    "MACOS_NOTARY_ISSUER_ID",
  ]) {
    assert.equal(output.includes(name), true, name);
  }
  assert.equal(output.includes("notarization source: recoverable"), true);
});

test("recoverable aliases, keychain markers, or mocked providers never report ready", () => {
  const report = assessReleasePrerequisites({
    ...legacyTriplet,
    MACOS_SIGNING_IDENTITY: "Developer ID Application: Fixture Owner (ABC1234567)",
    KEYCHAIN_IDENTITY_PRESENT: "1",
    MOCK_SECRET_PROVIDER: "passed",
  });

  assert.equal(report.notarizationSource, "recoverable-aliases");
  assert.equal(report.ready, false);
  assert.equal(runCli({
    ...legacyTriplet,
    KEYCHAIN_IDENTITY_PRESENT: "1",
    MOCK_SECRET_PROVIDER: "passed",
  }).exitCode, 1);
});

test("partial notarization triplets stay partial even beside a full legacy triplet", () => {
  const report = assessReleasePrerequisites({
    ...legacyTriplet,
    MACOS_NOTARY_KEY_ID: "FIXTUREKEYID",
  });

  assert.equal(report.notarizationSource, "partial");
  assert.equal(report.ready, false);
  assert.equal(
    assessReleasePrerequisites(without(legacyTriplet, "APP_STORE_CONNECT_ISSUER_ID"))
      .notarizationSource,
    "partial",
  );
});

test("invalid Sparkle public keys and signing identities are invalid and never ready", () => {
  const shortKey = Buffer.alloc(31).toString("base64");
  const longKey = Buffer.alloc(33).toString("base64");
  const nonCanonicalKey = `${validPublicKey}\n`;

  for (const key of ["SECRET-SENTINEL-NOT-BASE64", shortKey, longKey, nonCanonicalKey]) {
    const report = assessReleasePrerequisites(completeEnvironment({ MACOS_SPARKLE_PUBLIC_KEY: key }));
    assert.equal(nameStatus({ MACOS_SPARKLE_PUBLIC_KEY: key }, "MACOS_SPARKLE_PUBLIC_KEY"), "invalid");
    assert.equal(report.ready, false);
    assert.equal(runCli(completeEnvironment({ MACOS_SPARKLE_PUBLIC_KEY: key })).exitCode, 1);
  }

  for (const identity of [
    "Apple Distribution: Fixture Owner (ABC1234567)",
    "developer id application: fixture owner",
    "Developer ID Installer: Fixture Owner (ABC1234567)",
  ]) {
    const report = assessReleasePrerequisites(completeEnvironment({ MACOS_SIGNING_IDENTITY: identity }));
    assert.equal(nameStatus({ MACOS_SIGNING_IDENTITY: identity }, "MACOS_SIGNING_IDENTITY"), "invalid");
    assert.equal(report.ready, false);
    assert.equal(runCli(completeEnvironment({ MACOS_SIGNING_IDENTITY: identity })).exitCode, 1);
  }

  assert.equal(isValidSigningIdentity("Developer ID Application: Fixture Owner (ABC1234567)"), true);
  assert.equal(isValidSparklePublicKey(validPublicKey), true);
  assert.equal(isValidSparklePublicKey(""), false);
});

test("invalid values surface as redacted error statuses without echoing raw values", () => {
  const environment = completeEnvironment({
    MACOS_SPARKLE_PUBLIC_KEY: "SECRET-SENTINEL-PUBLIC-KEY-VALUE",
    MACOS_SIGNING_IDENTITY: "SECRET-SENTINEL-IDENTITY-VALUE",
    MACOS_CERTIFICATE_PASSWORD: "SECRET-SENTINEL-PASSWORD-VALUE",
    MACOS_NOTARY_PRIVATE_KEY: "SECRET-SENTINEL-NOTARY-KEY-VALUE",
  });
  const output = runCli(environment).output;

  assert.equal(output.includes("MACOS_SPARKLE_PUBLIC_KEY: invalid"), true);
  assert.equal(output.includes("MACOS_SIGNING_IDENTITY: invalid"), true);
  assert.equal(output.includes("SECRET-SENTINEL"), false);
  assert.equal(JSON.stringify(assessReleasePrerequisites(environment)).includes("SECRET-SENTINEL"), false);
});

test("unexpected errors are redacted instead of echoing raw values", () => {
  const environment = {};
  Object.defineProperty(environment, "MACOS_CERTIFICATE_PASSWORD", {
    enumerable: true,
    get() {
      throw new Error("SECRET-SENTINEL-LEAK");
    },
  });

  const result = runCli(environment);
  assert.equal(result.exitCode, 2);
  assert.equal(result.output.includes("SECRET-SENTINEL-LEAK"), false);
  assert.equal(result.output.includes("release-prerequisites"), true);
});

test("CLI prints fixed names only and exits nonzero until configuration is complete", () => {
  const sentinelEnvironment = completeEnvironment({
    MACOS_CERTIFICATE_P12_BASE64: "SECRET-SENTINEL-P12",
    MACOS_CERTIFICATE_PASSWORD: "SECRET-SENTINEL-CERT-PASSWORD",
    MACOS_SIGNING_IDENTITY: "SECRET-SENTINEL-IDENTITY",
    MACOS_SPARKLE_PUBLIC_KEY: "SECRET-SENTINEL-PUBLIC-KEY",
    MACOS_SPARKLE_PRIVATE_KEY: "SECRET-SENTINEL-SPARKLE-KEY",
    MACOS_NOTARY_KEY_ID: "SECRET-SENTINEL-KEY-ID",
    MACOS_NOTARY_ISSUER_ID: "SECRET-SENTINEL-ISSUER",
    MACOS_NOTARY_PRIVATE_KEY: "SECRET-SENTINEL-NOTARY-KEY",
    ...legacyTriplet,
  });

  const incomplete = spawnSync(process.execPath, [cliPath], {
    env: { PATH: process.env.PATH, ...without(sentinelEnvironment, "MACOS_NOTARY_PRIVATE_KEY") },
    encoding: "utf8",
  });
  assert.equal(incomplete.status, 1);
  assert.equal(`${incomplete.stdout}${incomplete.stderr}`.includes("SECRET-SENTINEL"), false);
  assert.equal(incomplete.stdout.includes("configuration: partial"), true);

  const complete = spawnSync(process.execPath, [cliPath], {
    env: { PATH: process.env.PATH, ...completeEnvironment() },
    encoding: "utf8",
  });
  assert.equal(complete.status, 0);
  assert.equal(complete.stdout.includes("configuration: complete"), true);
  assert.equal(complete.stdout.includes("signing, notarization, and update-feed publication stay unproven"), true);
  assert.equal(`${complete.stdout}${complete.stderr}`.includes("fixture-"), false);
});


test("CLI fails closed when invoked from a special-character path or symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "ts-prerequisites space#%-"));
  try {
    const copied = join(directory, "release-prerequisites.mjs");
    const linked = join(directory, "linked-prerequisites.mjs");
    copyFileSync(cliPath, copied);
    symlinkSync(copied, linked);
    for (const entry of [copied, linked]) {
      const result = spawnSync(process.execPath, [entry], { env: {}, encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stdout, /configuration: absent/);
      assert.match(result.stdout, /ready: not ready/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
