import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("creates a private loopback TLS identity without printing the key", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ts-hybrid-tls-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const output = execFileSync(
    "bash",
    ["scripts/macos/configure-hybrid-tls.sh", directory, "4443"],
    { encoding: "utf8" },
  );
  const certificate = readFileSync(join(directory, "server-certificate.pem"), "utf8");
  const privateKey = readFileSync(join(directory, "server-private-key.pem"), "utf8");
  assert.match(certificate, /BEGIN CERTIFICATE/u);
  assert.match(privateKey, /BEGIN PRIVATE KEY/u);
  assert.equal(statSync(join(directory, "server-private-key.pem")).mode & 0o777, 0o600);
  assert.doesNotMatch(output, /BEGIN PRIVATE KEY/u);
  assert.match(output, /https:\/\/127\.0\.0\.1:4443/u);
});
