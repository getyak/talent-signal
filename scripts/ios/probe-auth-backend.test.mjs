import assert from "node:assert/strict";
import test from "node:test";
import {
  probeAuthenticationBackend,
  repositoryContractVersion,
  validateChallenge,
} from "./probe-auth-backend.mjs";

const validChallenge = {
  challenge_id: "challenge-1",
  contract_version: repositoryContractVersion(),
  expires_at: "2030-01-01T00:05:00.000Z",
  nonce: "nonce-1",
};

test("validates the repository contract and a future challenge", () => {
  assert.equal(
    validateChallenge(validChallenge, repositoryContractVersion(), 1_893_456_000_000),
    validChallenge,
  );
  assert.throws(
    () =>
      validateChallenge(
        { ...validChallenge, contract_version: "stale" },
        repositoryContractVersion(),
        1_893_456_000_000,
      ),
    /invalid or stale contract/u,
  );
});

test("probes the path beneath an optional API base path", async () => {
  let observedURL;
  let observedOptions;
  await probeAuthenticationBackend({
    baseURL: "https://api.example.test/talent-signal",
    expectedContractVersion: repositoryContractVersion(),
    fetchImplementation: async (url, options) => {
      observedURL = url;
      observedOptions = options;
      return new Response(JSON.stringify(validChallenge), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    },
  });

  assert.equal(
    observedURL.href,
    "https://api.example.test/talent-signal/v1/auth/apple/challenges",
  );
  assert.equal(observedOptions.method, "POST");
  assert.deepEqual(JSON.parse(observedOptions.body), {
    client_label: "ios-release-probe",
  });
});

test("rejects non-challenge responses", async () => {
  await assert.rejects(
    probeAuthenticationBackend({
      baseURL: "https://api.example.test",
      expectedContractVersion: repositoryContractVersion(),
      fetchImplementation: async () => new Response(null, { status: 404 }),
    }),
    /HTTP 404/u,
  );
});
