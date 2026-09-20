import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppleOAuthCredentials } from "./apple-oauth";

const clientId = "com.talentsignal.web";
const teamId = "ABCDEFGHIJ";
const keyId = "KLMNOPQRST";
const appleAudience = "https://appleid.apple.com";
// Apple's documented ceiling for a client secret: six months in seconds.
const appleMaxClientSecretSeconds = 15_777_000;
const frozenNow = new Date("2026-01-01T00:00:00.000Z");
const frozenNowSeconds = Math.floor(frozenNow.getTime() / 1000);

const { privateKey: fixturePrivateKey, publicKey: fixturePublicKey } =
  generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const fixturePrivateKeyPem = fixturePrivateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
// Corrupt the ephemeral fixture's payload while preserving its PEM envelope.
// Do not put private-key-shaped literals in repository source.
const malformedPrivateKeyPem = fixturePrivateKeyPem
  .split("\n")
  .map((line) => line.startsWith("-") || !line ? line : "broken")
  .join("\n");

const dynamicEnvironment = {
  AUTH_APPLE_ID: clientId,
  AUTH_APPLE_TEAM_ID: teamId,
  AUTH_APPLE_KEY_ID: keyId,
  AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem,
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function buildStaticClientSecret(
  overrides: {
    header?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    signature?: string;
  } = {},
): string {
  const header = { alg: "ES256", kid: keyId, typ: "JWT", ...overrides.header };
  const payload = {
    iss: teamId,
    iat: frozenNowSeconds,
    exp: frozenNowSeconds + 3600,
    aud: appleAudience,
    sub: clientId,
    ...overrides.payload,
  };
  return `${encodeSegment(header)}.${encodeSegment(payload)}.${
    overrides.signature ?? "fixture-signature"
  }`;
}

function decodeSegment(segment: string | undefined) {
  return JSON.parse(Buffer.from(segment ?? "", "base64url").toString("utf8"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(frozenNow);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dynamic Apple client secret", () => {
  it("generates a 15-minute ES256 secret from a P-256 .p8 key", () => {
    const credentials = getAppleOAuthCredentials(dynamicEnvironment);

    expect(credentials?.clientId).toBe(clientId);
    const [header, payload, signature] = credentials!.clientSecret.split(".");

    expect(decodeSegment(header)).toEqual({
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    });
    expect(decodeSegment(payload)).toEqual({
      iss: teamId,
      iat: frozenNowSeconds,
      exp: frozenNowSeconds + 900,
      aud: appleAudience,
      sub: clientId,
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`, "utf8"),
        { key: fixturePublicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);
  });

  it("regenerates the secret as time advances instead of reusing an expired one", () => {
    const first = getAppleOAuthCredentials(dynamicEnvironment)!;

    vi.setSystemTime(new Date(frozenNow.getTime() + 14 * 60 * 1000));
    const second = getAppleOAuthCredentials(dynamicEnvironment)!;

    expect(second.clientSecret).not.toBe(first.clientSecret);
    const payload = decodeSegment(second.clientSecret.split(".")[1]);
    expect(payload.exp - payload.iat).toBe(900);
    expect(payload.exp).toBe(frozenNowSeconds + 14 * 60 + 900);
  });

  it("accepts a single-line .p8 value with escaped newlines", () => {
    const credentials = getAppleOAuthCredentials({
      ...dynamicEnvironment,
      AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem.replace(/\n/g, "\\n"),
    });

    expect(credentials).not.toBeNull();
    expect(credentials!.clientSecret.split(".")).toHaveLength(3);
  });
});

describe("Apple private-key configuration completeness", () => {
  it("requires the full private-key set and never falls back to a static secret", () => {
    const base = { AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: buildStaticClientSecret() };

    for (const partial of [
      { AUTH_APPLE_TEAM_ID: teamId },
      { AUTH_APPLE_KEY_ID: keyId },
      { AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem },
      { AUTH_APPLE_TEAM_ID: teamId, AUTH_APPLE_KEY_ID: keyId },
      { AUTH_APPLE_TEAM_ID: teamId, AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem },
      { AUTH_APPLE_KEY_ID: keyId, AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem },
      { AUTH_APPLE_TEAM_ID: "" },
      { AUTH_APPLE_KEY_ID: "" },
      { AUTH_APPLE_PRIVATE_KEY: "   " },
      { AUTH_APPLE_TEAM_ID: "", AUTH_APPLE_KEY_ID: keyId, AUTH_APPLE_PRIVATE_KEY: fixturePrivateKeyPem },
    ]) {
      expect(getAppleOAuthCredentials({ ...base, ...partial })).toBeNull();
    }
  });

  it("requires a valid Services ID", () => {
    expect(
      getAppleOAuthCredentials({ ...dynamicEnvironment, AUTH_APPLE_ID: undefined }),
    ).toBeNull();
    expect(
      getAppleOAuthCredentials({ ...dynamicEnvironment, AUTH_APPLE_ID: " not a services id " }),
    ).toBeNull();
  });

  it("rejects malformed team and key identifiers", () => {
    expect(
      getAppleOAuthCredentials({ ...dynamicEnvironment, AUTH_APPLE_TEAM_ID: "team-1" }),
    ).toBeNull();
    expect(
      getAppleOAuthCredentials({ ...dynamicEnvironment, AUTH_APPLE_KEY_ID: "short" }),
    ).toBeNull();
  });

  it("rejects non-P-256, public, and malformed private keys", () => {
    const rsaPrivateKeyPem = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    const p384PrivateKeyPem = generateKeyPairSync("ec", { namedCurve: "secp384r1" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    const publicKeyPem = fixturePublicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    for (const invalidKey of [
      rsaPrivateKeyPem,
      p384PrivateKeyPem,
      publicKeyPem,
      "not-a-pem",
      malformedPrivateKeyPem,
    ]) {
      expect(
        getAppleOAuthCredentials({
          ...dynamicEnvironment,
          AUTH_APPLE_PRIVATE_KEY: invalidKey,
        }),
      ).toBeNull();
    }
  });

  it("returns null without logging secret or error data", () => {
    const log = vi.spyOn(console, "log");
    const warn = vi.spyOn(console, "warn");
    const error = vi.spyOn(console, "error");

    expect(
      getAppleOAuthCredentials({
        ...dynamicEnvironment,
        AUTH_APPLE_PRIVATE_KEY: malformedPrivateKeyPem,
      }),
    ).toBeNull();

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("static Apple client secret metadata", () => {
  it("accepts a static secret whose decoded metadata matches", () => {
    const clientSecret = buildStaticClientSecret();

    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: clientSecret }),
    ).toEqual({ clientId, clientSecret });
  });

  it("checks metadata only and cannot prove Apple authorized the signing key", () => {
    const clientSecret = buildStaticClientSecret({
      signature: "not-a-real-signature",
    });

    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: clientSecret }),
    ).toEqual({ clientId, clientSecret });
  });

  it.each([
    ["alg is not ES256", { header: { alg: "RS256" } }],
    ["kid is missing", { header: { kid: undefined } }],
    ["kid is malformed", { header: { kid: "lowercase-key" } }],
  ])("rejects a static secret when %s", (_label, overrides) => {
    const clientSecret = buildStaticClientSecret(overrides);

    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: clientSecret }),
    ).toBeNull();
  });

  it("accepts the exact Apple lifetime and future-distance ceiling", () => {
    const atCeiling = buildStaticClientSecret({
      payload: { iat: frozenNowSeconds, exp: frozenNowSeconds + appleMaxClientSecretSeconds },
    });
    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: atCeiling }),
    ).not.toBeNull();

    // Issued in the past but still exactly within the absolute future ceiling.
    const issuedEarlier = buildStaticClientSecret({
      payload: {
        iat: frozenNowSeconds - 1000,
        exp: frozenNowSeconds - 1000 + appleMaxClientSecretSeconds,
      },
    });
    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: issuedEarlier }),
    ).not.toBeNull();
  });

  it.each([
    ["audience is not Apple", { aud: "https://example.test" }],
    ["subject is a different client", { sub: "com.example.other" }],
    ["issuer is not a team identifier", { iss: "not-a-team-id" }],
    ["issued in the future", { iat: frozenNowSeconds + 3600 }],
    ["already expired", { iat: frozenNowSeconds - 7200, exp: frozenNowSeconds - 3600 }],
    ["expires too soon", { iat: frozenNowSeconds, exp: frozenNowSeconds + 30 }],
    ["expires before issue", { iat: frozenNowSeconds, exp: frozenNowSeconds - 1 }],
    [
      "lifetime exceeds Apple's maximum",
      { iat: frozenNowSeconds, exp: frozenNowSeconds + appleMaxClientSecretSeconds + 1 },
    ],
    [
      "expiration exceeds Apple's maximum distance into the future",
      {
        iat: frozenNowSeconds + 300,
        exp: frozenNowSeconds + 300 + appleMaxClientSecretSeconds,
      },
    ],
    ["issued at is fractional", { iat: frozenNowSeconds + 0.5 }],
    ["expires at is not a number", { exp: "later" }],
  ])("rejects a static secret when %s", (_label, payload) => {
    const clientSecret = buildStaticClientSecret({ payload });

    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: clientSecret }),
    ).toBeNull();
  });

  it.each([
    "header.payload.signature",
    "only.two",
    "",
    "a.b.c.d",
    `${encodeSegment({ alg: "ES256" })}.${encodeSegment({})}.`,
  ])("rejects malformed client secret %j", (clientSecret) => {
    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: clientSecret }),
    ).toBeNull();
  });

  it("requires a static secret when no private-key settings are supplied", () => {
    expect(getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId })).toBeNull();
    expect(
      getAppleOAuthCredentials({ AUTH_APPLE_ID: clientId, AUTH_APPLE_SECRET: "   " }),
    ).toBeNull();
  });
});
