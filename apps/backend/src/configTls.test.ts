import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, loadTlsIdentity } from "./config.js";

const temporaryDirectories: string[] = [];

function privateKeyBoundary(kind: "BEGIN" | "END"): string {
  return `-----${kind} ${["PRIVATE", "KEY"].join(" ")}-----`;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "ts-backend-tls-"));
  temporaryDirectories.push(directory);
  const certificate = join(directory, "certificate.pem");
  const privateKey = join(directory, "private-key.pem");
  writeFileSync(certificate, "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----\n");
  writeFileSync(
    privateKey,
    `${privateKeyBoundary("BEGIN")}\nfixture\n${privateKeyBoundary("END")}\n`,
    { mode: 0o600 },
  );
  return { certificate, directory, privateKey };
}

describe("backend TLS identity boundary", () => {
  it("loads owned regular PEM files with a private 0600 key", () => {
    const value = fixture();
    expect(loadTlsIdentity(value.certificate, value.privateKey).certificatePem).toContain("CERTIFICATE");
  });

  it("rejects a group-readable private key", () => {
    const value = fixture();
    chmodSync(value.privateKey, 0o640);
    expect(() => loadTlsIdentity(value.certificate, value.privateKey)).toThrow(/group- or world-readable/u);
  });

  it("rejects certificate and key symlinks", () => {
    const value = fixture();
    const certificateLink = join(value.directory, "certificate-link.pem");
    const keyLink = join(value.directory, "key-link.pem");
    symlinkSync(value.certificate, certificateLink);
    symlinkSync(value.privateKey, keyLink);
    expect(() => loadTlsIdentity(certificateLink, value.privateKey)).toThrow(/symlink/u);
    expect(() => loadTlsIdentity(value.certificate, keyLink)).toThrow(/symlink/u);
  });

  it("rejects partial TLS configuration and non-loopback binding", () => {
    const original = { ...process.env };
    try {
      process.env.DATABASE_URL = "postgresql://fixture.invalid/talent_signal";
      process.env.TALENT_SIGNAL_TLS_CERTIFICATE_PATH = "/synthetic/certificate.pem";
      delete process.env.TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH;
      expect(() => loadConfig()).toThrow(/configured together/u);

      const value = fixture();
      process.env.TALENT_SIGNAL_TLS_CERTIFICATE_PATH = value.certificate;
      process.env.TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH = value.privateKey;
      process.env.HOST = "0.0.0.0";
      expect(() => loadConfig()).toThrow(/requires HOST=127\.0\.0\.1/u);
    } finally {
      process.env = original;
    }
  });
});
