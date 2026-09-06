import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import type { Pool } from "pg";
import type { BackendConfig } from "../config.js";
import { createGoogleChallenge, createGoogleSession, verifyGoogleIdentity } from "./googleAuth.js";

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256"); privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "fixture" }] });
});
const config = { googleSignInAudiences: ["ios-client", "web-client"], sessionTtlSeconds: 3600 } as BackendConfig;
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ iss: "https://accounts.google.com", sub: "stable-subject", aud: "ios-client",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    email: "Test@Example.com", email_verified: true, nonce: "nonce-hash", ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(privateKey);
}

describe("Google identity verification", () => {
  it("normalizes a verified identity while retaining the provider subject", async () => {
    expect(await verifyGoogleIdentity(await token(), config.googleSignInAudiences!, keys))
      .toMatchObject({ subject: "stable-subject", email: "test@example.com", nonce: "nonce-hash" });
  });
  it.each([
    { aud: "another-app" }, { iss: "https://attacker.test" }, { exp: 1 },
    { iat: 1 }, { email_verified: false }, { email_verified: "true" },
    { nonce: null }, { sub: "" }, { azp: "another-app" }, { email: "" },
  ])("rejects invalid claims %j", async bad => {
    await expect(verifyGoogleIdentity(await token(bad), config.googleSignInAudiences!, keys)).rejects.toThrow();
  });
  it("rejects a forged signature", async () => {
    const valid = await token(); const parts = valid.split("."); parts[2] = "a".repeat(parts[2]!.length);
    await expect(verifyGoogleIdentity(parts.join("."), config.googleSignInAudiences!, keys)).rejects.toThrow();
  });
});

function database(options: { consumed?: boolean; replay?: boolean; collision?: boolean; inactive?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("UPDATE google_login_challenges")) return { rowCount: options.consumed ? 0 : 1, rows: [{ id: "challenge" }] };
    if (sql.includes("INSERT INTO google_consumed_assertions")) return { rowCount: options.replay ? 0 : 1, rows: [{}] };
    if (sql.includes("FROM auth_identities identities")) return { rowCount: options.inactive ? 1 : 0, rows: options.inactive ? [{ status: "suspended" }] : [] };
    if (sql.includes("SELECT id FROM users")) return { rowCount: options.collision ? 1 : 0, rows: [] };
    return { rowCount: 1, rows: [] };
  });
  const release = vi.fn();
  return { pool: { connect: async () => ({ query, release }), query } as unknown as Pool, query, release };
}
const request = { challenge_id: "00000000-0000-4000-8000-000000000001", identity_token: "opaque-google-token", client_label: "ios" };
const verified = async () => ({ subject: "one", email: "one@example.com", name: "One", nonce: "hashed-nonce", expiresAt: new Date(Date.now() + 3600000) });

describe("Google backend session authority", () => {
  it("stays disabled until configured", async () => {
    const db = database();
    await expect(createGoogleChallenge(db.pool, { ...config, googleSignInAudiences: [] }, "ios")).rejects.toMatchObject({ statusCode: 404 });
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each([
    [{ consumed: true }, "GOOGLE_CHALLENGE_INVALID"], [{ replay: true }, "GOOGLE_TOKEN_REPLAYED"],
    [{ collision: true }, "GOOGLE_ACCOUNT_LINK_REQUIRED"], [{ inactive: true }, "ACCOUNT_INACTIVE"],
  ] as const)("rolls back unsafe attempts %j", async (option, code) => {
    const db = database(option);
    await expect(createGoogleSession(db.pool, config, request, verified)).rejects.toMatchObject({ code });
    expect(db.query).toHaveBeenCalledWith("ROLLBACK");
    expect(db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO sessions"))).toBe(false);
    expect(db.release).toHaveBeenCalled();
  });
  it("never reaches the database for an invalid identity token", async () => {
    const db = database();
    await expect(createGoogleSession(db.pool, config, request, async () => { throw new Error("bad signature"); })).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
    expect(db.query).not.toHaveBeenCalled();
  });
  it("creates a least-privilege session only after consuming the bound challenge", async () => {
    const db = database(); const result = await createGoogleSession(db.pool, config, request, verified);
    expect(result.user).toMatchObject({ role: "member", kind: "google_human", email: "one@example.com" });
    expect(result.access_token).toBeTruthy();
    expect(db.query).toHaveBeenLastCalledWith("COMMIT");
  });
});
