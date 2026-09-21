import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { CONTRACT_VERSION, type SessionResponse } from "@talent-signal/contracts";
import { authCookieSecure } from "../auth-cookie-policy";
import { authSecret, backendAuthBaseUrl } from "./backendAuth";
import {
  OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
  OAUTH_CLIENT_LABEL,
  OAUTH_NONCE_COOKIE,
  assertOAuthSession,
  postOAuthEndpoint,
  verifyOAuthBackendSession,
  writeOAuthNonceCookie,
} from "./oauth-session";

/** Auth.js nonce cookie name (shared with Apple; payload is provider-tagged). */
export const GOOGLE_NONCE_COOKIE = OAUTH_NONCE_COOKIE;
const attemptCookieName = "talent-signal.google-attempt";

type GoogleChallenge = {
  contract_version: unknown;
  challenge_id: unknown;
  nonce: unknown;
  expires_at: unknown;
};

export async function prepareGoogleSignIn() {
  const challenge = (await postOAuthEndpoint(
    "/v1/auth/google/challenges",
    { client_label: OAUTH_CLIENT_LABEL },
    "Google",
  )) as GoogleChallenge;
  if (
    challenge.contract_version !== CONTRACT_VERSION ||
    typeof challenge.challenge_id !== "string" ||
    typeof challenge.nonce !== "string" ||
    !Number.isFinite(Date.parse(String(challenge.expires_at))) ||
    Date.parse(String(challenge.expires_at)) <= Date.now()
  ) {
    throw new Error("Google sign-in challenge is invalid.");
  }
  const value = await encode({
    secret: authSecret(),
    salt: attemptCookieName,
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    token: {
      challengeID: challenge.challenge_id,
      endpoint: backendAuthBaseUrl(),
      provider: "google",
    },
  });
  (await cookies()).set(attemptCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    secure: authCookieSecure(),
  });
  return createHash("sha256").update(challenge.nonce).digest("hex");
}

export async function finishGoogleSignIn(
  identityToken: string,
): Promise<SessionResponse> {
  const jar = await cookies();
  const value = jar.get(attemptCookieName)?.value;
  jar.delete(attemptCookieName);
  const attempt = value
    ? await decode({ token: value, secret: authSecret(), salt: attemptCookieName })
    : null;
  if (
    !attempt ||
    typeof attempt.challengeID !== "string" ||
    attempt.provider !== "google" ||
    attempt.endpoint !== backendAuthBaseUrl()
  ) {
    throw new Error("Start Google sign-in from the login page again.");
  }
  const session = (await postOAuthEndpoint(
    "/v1/auth/google",
    {
      challenge_id: attempt.challengeID,
      identity_token: identityToken,
      client_label: OAUTH_CLIENT_LABEL,
    },
    "Google",
  )) as SessionResponse;
  assertOAuthSession(session, "Google");
  return verifyOAuthBackendSession(session, "Google");
}

// Auth.js owns state and PKCE. Bind its OIDC nonce check to the server-issued
// challenge, preserving the provider-tagged encrypted cookie format in beta.32.
export async function bindGoogleNonce(
  authorizationURL: string,
  nonce: string,
) {
  const url = new URL(authorizationURL);
  if (url.origin !== "https://accounts.google.com") {
    throw new Error("Unexpected Google authorization endpoint.");
  }
  await writeOAuthNonceCookie({ value: nonce, provider: "google", crossSite: false });
  url.searchParams.set("nonce", nonce);
  return url.toString();
}
