import { randomBytes, randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type SessionResponse,
  type SimulatedLoginRequest,
} from "@talent-signal/contracts";
import type { preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";

import type { BackendConfig } from "../config.js";
import { ApiError } from "../lib/apiError.js";
import { sha256 } from "../lib/hash.js";

export interface AuthContext {
  accountId: string;
  accountSlug: string;
  userId: string;
  userEmail: string;
  userKind: "simulated_human";
  sessionId: string;
}

export async function createSimulatedSession(
  pool: Pool,
  config: BackendConfig,
  request: SimulatedLoginRequest,
): Promise<SessionResponse> {
  if (!config.simulatedAuthEnabled) {
    throw new ApiError(
      404,
      "SIMULATED_AUTH_DISABLED",
      "Simulated authentication is not available.",
    );
  }

  const result = await pool.query<{
    account_id: string;
    account_name: string;
    account_slug: string;
    user_id: string;
    user_email: string;
    display_name: string;
  }>(
    `SELECT
       accounts.id AS account_id,
       accounts.name AS account_name,
       accounts.slug AS account_slug,
       users.id AS user_id,
       users.email AS user_email,
       users.display_name
     FROM accounts
     JOIN users ON users.account_id = accounts.id
     WHERE accounts.slug = $1
       AND users.email = $2
       AND users.status = 'active'
       AND users.kind = 'simulated_human'`,
    [request.account_slug, request.user_email],
  );
  const identity = result.rows[0];
  if (!identity) {
    throw new ApiError(
      401,
      "SIMULATED_IDENTITY_NOT_FOUND",
      "The local fixture account or user was not found.",
    );
  }

  const accessToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
  await pool.query(
    `INSERT INTO sessions(
       id, account_id, user_id, token_hash, client_label, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      identity.account_id,
      identity.user_id,
      sha256(accessToken),
      request.client_label,
      expiresAt,
    ],
  );

  return {
    contract_version: CONTRACT_VERSION,
    access_token: accessToken,
    expires_at: expiresAt.toISOString(),
    account: {
      id: identity.account_id,
      slug: identity.account_slug,
      name: identity.account_name,
    },
    user: {
      id: identity.user_id,
      email: identity.user_email,
      display_name: identity.display_name,
      kind: "simulated_human",
    },
  };
}

export function createAuthGuard(pool: Pool): preHandlerHookHandler {
  return async function authGuard(request): Promise<void> {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new ApiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "A bearer session is required.",
      );
    }
    const accessToken = authorization.slice("Bearer ".length);
    const result = await pool.query<{
      account_id: string;
      account_slug: string;
      user_id: string;
      user_email: string;
      user_kind: "simulated_human";
      session_id: string;
    }>(
      `SELECT
         sessions.id AS session_id,
         sessions.account_id,
         accounts.slug AS account_slug,
         users.id AS user_id,
         users.email AS user_email,
         users.kind AS user_kind
       FROM sessions
       JOIN accounts ON accounts.id = sessions.account_id
       JOIN users
         ON users.account_id = sessions.account_id
        AND users.id = sessions.user_id
       WHERE sessions.token_hash = $1
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > now()
         AND users.status = 'active'`,
      [sha256(accessToken)],
    );
    const auth = result.rows[0];
    if (!auth) {
      throw new ApiError(
        401,
        "SESSION_INVALID",
        "The session is invalid, expired, or revoked.",
      );
    }
    request.auth = {
      accountId: auth.account_id,
      accountSlug: auth.account_slug,
      userId: auth.user_id,
      userEmail: auth.user_email,
      userKind: auth.user_kind,
      sessionId: auth.session_id,
    };
  };
}
