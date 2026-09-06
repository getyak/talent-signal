import { randomBytes, randomUUID } from "node:crypto";
import { CONTRACT_VERSION, ErrorResponseSchema, SessionResponseSchema } from "@talent-signal/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Pool } from "pg";
import type { BackendConfig } from "../config.js";
import { ApiError } from "../lib/apiError.js";
import { sha256 } from "../lib/hash.js";
import { insertSession } from "./auth.js";

const ChallengeRequest = Type.Object({ client_label: Type.String({ minLength: 1, maxLength: 80 }) }, { additionalProperties: false });
const GoogleLoginRequest = Type.Object({
  challenge_id: Type.String({ format: "uuid" }),
  identity_token: Type.String({ minLength: 100, maxLength: 20_000 }),
  client_label: Type.String({ minLength: 1, maxLength: 80 }),
}, { additionalProperties: false });
type GoogleLogin = Static<typeof GoogleLoginRequest>;

export type GoogleIdentity = { subject: string; email: string; name: string; nonce: string; expiresAt: Date };
export type GoogleVerifier = (token: string, audiences: string[]) => Promise<GoogleIdentity>;
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleIdentity(token: string, audiences: string[], keys: JWTVerifyGetKey = googleKeys): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"], audience: audiences,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    maxTokenAge: "10 minutes",
  });
  if (typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.email !== "string" || ! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 320 ||
      payload.email_verified !== true || typeof payload.nonce !== "string" ||
      !payload.exp || (payload.azp !== undefined &&
        (typeof payload.azp !== "string" || !audiences.includes(payload.azp)))) {
    throw new ApiError(401, "GOOGLE_TOKEN_INVALID", "The Google identity could not be verified.");
  }
  return { subject: payload.sub, email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" ? payload.name.slice(0, 100) : "Talent Signal",
    nonce: payload.nonce, expiresAt: new Date(payload.exp * 1_000) };
}

function audiences(config: BackendConfig): string[] {
  if (!config.googleSignInAudiences?.length) {
    throw new ApiError(404, "GOOGLE_SIGN_IN_DISABLED", "Google sign-in is not configured for this service.");
  }
  return config.googleSignInAudiences;
}

export async function createGoogleChallenge(pool: Pool, config: BackendConfig, clientLabel: string) {
  audiences(config);
  // Attempts contain no raw tokens; prune expired replay receipts before their
  // parent challenges, with a bounded batch so sign-in stays inexpensive.
  await pool.query(`DELETE FROM google_consumed_assertions WHERE assertion_hash IN
    (SELECT assertion_hash FROM google_consumed_assertions WHERE expires_at < now() LIMIT 1000)`);
  await pool.query(`DELETE FROM google_login_challenges WHERE id IN
    (SELECT id FROM google_login_challenges WHERE expires_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM google_consumed_assertions a WHERE a.challenge_id = google_login_challenges.id) LIMIT 1000)`);
  const id = randomUUID(), nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 300_000);
  await pool.query(`INSERT INTO google_login_challenges(id, expected_nonce_hash, client_label, expires_at)
    VALUES ($1, $2, $3, $4)`, [id, sha256(nonce), clientLabel, expiresAt]);
  return { contract_version: CONTRACT_VERSION, challenge_id: id, nonce, expires_at: expiresAt.toISOString() };
}

export async function createGoogleSession(pool: Pool, config: BackendConfig, request: GoogleLogin, verify: GoogleVerifier = verifyGoogleIdentity) {
  const allowed = audiences(config);
  let identity: GoogleIdentity;
  try { identity = await verify(request.identity_token, allowed); }
  catch { throw new ApiError(401, "GOOGLE_TOKEN_INVALID", "The Google identity could not be verified. Start sign-in again."); }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(`UPDATE google_login_challenges SET consumed_at = now()
      WHERE id = $1 AND expected_nonce_hash = $2 AND client_label = $3
        AND consumed_at IS NULL AND expires_at > now() RETURNING id`,
    [request.challenge_id, identity.nonce, request.client_label]);
    if (!consumed.rowCount) throw new ApiError(409, "GOOGLE_CHALLENGE_INVALID", "This Google sign-in attempt has expired or was already used.");
    const assertion = await client.query(`INSERT INTO google_consumed_assertions(assertion_hash, challenge_id, expires_at)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING assertion_hash`,
    [sha256(request.identity_token), request.challenge_id, identity.expiresAt]);
    if (!assertion.rowCount) throw new ApiError(409, "GOOGLE_TOKEN_REPLAYED", "Start a new Google sign-in attempt.");

    const subjectHash = sha256(`https://accounts.google.com:${identity.subject}`);
    // Serialize first sign-ins for the same subject before checking/creating identity.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`google:${subjectHash}`]);
    const existing = await client.query<{ account_id: string; account_name: string; account_slug: string;
      user_id: string; display_name: string; email: string; status: string; account_role: "admin" | "member"; username: string | null }>(
      `SELECT identities.account_id, accounts.name AS account_name, accounts.slug AS account_slug,
         users.id AS user_id, users.display_name, users.email, users.status, users.account_role, users.username
       FROM auth_identities identities JOIN accounts ON accounts.id = identities.account_id
       JOIN users ON users.account_id = identities.account_id AND users.id = identities.user_id
       WHERE identities.provider = 'google' AND identities.subject_hash = $1`, [subjectHash]);
    let user = existing.rows[0];
    if (user && user.status !== "active") throw new ApiError(403, "ACCOUNT_INACTIVE", "This workspace account is not active.");
    if (!user) {
      // Never turn a matching email into authority over an existing workspace.
      // Email is the visible login clue; provider subject owns federated identity.
      const collision = await client.query("SELECT id FROM users WHERE lower(email) = $1 LIMIT 1", [identity.email]);
      if (collision.rowCount) throw new ApiError(409, "GOOGLE_ACCOUNT_LINK_REQUIRED", "This email already has a workspace. Sign in with its existing method to preserve that account.");
      const accountID = randomUUID(), userID = randomUUID(), slug = `personal-${randomUUID()}`;
      const accountName = `${identity.name}'s workspace`;
      await client.query("INSERT INTO accounts(id, slug, name) VALUES ($1, $2, $3)", [accountID, slug, accountName]);
      await client.query(`INSERT INTO users(id, account_id, email, display_name, kind)
        VALUES ($1, $2, $3, $4, 'google_human')`, [userID, accountID, identity.email, identity.name]);
      await client.query(`INSERT INTO auth_identities(id, account_id, user_id, provider, subject_hash)
        VALUES ($1, $2, $3, 'google', $4)`, [randomUUID(), accountID, userID, subjectHash]);
      user = { account_id: accountID, account_name: accountName, account_slug: slug,
        user_id: userID, display_name: identity.name, email: identity.email, status: "active", account_role: "member", username: null };
    }
    await client.query("UPDATE auth_identities SET last_authenticated_at = now() WHERE provider = 'google' AND subject_hash = $1", [subjectHash]);
    const session = await insertSession(client, config, {
      accountId: user.account_id, accountName: user.account_name, accountSlug: user.account_slug,
      userId: user.user_id, userEmail: user.email, displayName: user.display_name,
      role: user.account_role, userKind: "google_human", username: user.username,
    }, request.client_label);
    await client.query("COMMIT");
    return session;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export function registerGoogleAuth(app: FastifyInstance, pool: Pool, config: BackendConfig, verify: GoogleVerifier = verifyGoogleIdentity) {
  app.post<{ Body: Static<typeof ChallengeRequest> }>("/v1/auth/google/challenges", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    schema: { body: ChallengeRequest },
  }, async (request, reply) => reply.code(201).send(await createGoogleChallenge(pool, config, request.body.client_label)));
  app.post<{ Body: GoogleLogin }>("/v1/auth/google", {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
    schema: { body: GoogleLoginRequest, response: { 200: SessionResponseSchema, "4xx": ErrorResponseSchema } },
  }, async request => createGoogleSession(pool, config, request.body, verify));
}
