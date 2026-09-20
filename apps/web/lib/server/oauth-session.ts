import "server-only";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type SessionResponse,
} from "@talent-signal/contracts";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
export class OAuthAccountLinkRequired extends Error {}

import { withAuthRequestTimeout } from "../auth-request-timeout";
import { authCookieSecure } from "../auth-cookie-policy";
import { authSecret, backendAuthBaseUrl } from "./backendAuth";

/** Auth.js nonce cookie. One name; the encrypted payload carries the provider. */
export const OAUTH_NONCE_COOKIE = "talent-signal.oauth-nonce";
export const OAUTH_CLIENT_LABEL = "talent-signal-web";
export const OAUTH_ATTEMPT_COOKIE_TTL_SECONDS = 300;

export type OAuthProviderId = "apple" | "google";

export type OAuthBackendClaims = {
  backendAccessToken: string;
  backendAccountId: string;
  backendAccountName: string;
  backendAccountSlug: string;
  backendExpiresAt: string;
  backendRole: "admin" | "member";
  backendUserId: string;
  backendUsername: string | null;
};

export async function postOAuthEndpoint(
  path: string,
  body: unknown,
  providerLabel: string,
): Promise<unknown> {
  const response = await fetch(`${backendAuthBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    if (payload?.error?.code === "APPLE_ACCOUNT_LINK_REQUIRED" || payload?.error?.code === "GOOGLE_ACCOUNT_LINK_REQUIRED") {
      throw new OAuthAccountLinkRequired("Use the original sign-in method for this account.");
    }
    throw new Error(`${providerLabel} workspace sign-in could not be completed.`);
  }
  return response.json();
}

export function assertOAuthSession(
  session: SessionResponse,
  providerLabel: string,
): SessionResponse {
  if (
    session.contract_version !== CONTRACT_VERSION ||
    !session.access_token ||
    !Number.isFinite(Date.parse(session.expires_at)) ||
    Date.parse(session.expires_at) <= Date.now()
  ) {
    throw new Error(`Invalid ${providerLabel} workspace session.`);
  }
  return session;
}

/**
 * Read the freshly minted session back from the backend before trusting it.
 * This proves the exchanged token is the account the provider actually opened.
 */
export async function verifyOAuthBackendSession(
  session: SessionResponse,
  providerLabel: string,
): Promise<SessionResponse> {
  const client = new TalentSignalClient(backendAuthBaseUrl(), session.access_token);
  const verified = await withAuthRequestTimeout(signal => client.currentSession(signal), { timeoutMs: 5_000 });
  if (
    verified.account.id !== session.account.id ||
    verified.user.id !== session.user.id
  ) {
    throw new Error(
      `${providerLabel} workspace session does not match the signed-in account.`,
    );
  }
  return session;
}

/**
 * The exact backend claim shape Auth.js must write for every federated
 * provider. Google and Apple share this so downstream session readers cannot
 * observe provider-specific fields.
 */
export function oauthBackendClaims(session: SessionResponse): OAuthBackendClaims {
  return {
    backendAccessToken: session.access_token,
    backendAccountId: session.account.id,
    backendAccountName: session.account.name,
    backendAccountSlug: session.account.slug,
    backendExpiresAt: session.expires_at,
    backendRole: session.user.role,
    backendUserId: session.user.id,
    backendUsername: session.user.username,
  };
}

/**
 * Seal a server-issued nonce into the Auth.js nonce cookie. `crossSite` is
 * required for Apple's `response_mode=form_post` callback: the cookie must be
 * `Secure; SameSite=None`, while the long-lived session cookie is untouched.
 * The provider tag matches Auth.js' own cookie format so its nonce check
 * rejects a cookie minted for the other provider.
 */
export async function writeOAuthNonceCookie(options: {
  value: string;
  provider: OAuthProviderId;
  crossSite: boolean;
}): Promise<void> {
  const value = await encode({
    secret: authSecret(),
    salt: OAUTH_NONCE_COOKIE,
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    token: { value: options.value, provider: options.provider },
  });
  (await cookies()).set(OAUTH_NONCE_COOKIE, value, {
    httpOnly: true,
    sameSite: options.crossSite ? "none" : "lax",
    path: "/",
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    secure: options.crossSite ? true : authCookieSecure(),
  });
}
