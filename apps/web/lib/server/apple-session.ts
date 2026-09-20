import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { CONTRACT_VERSION, type SessionResponse } from "@talent-signal/contracts";
import { authSecret, backendAuthBaseUrl } from "./backendAuth";
import {
  OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
  OAUTH_CLIENT_LABEL,
  assertOAuthSession,
  postOAuthEndpoint,
  verifyOAuthBackendSession,
  writeOAuthNonceCookie,
} from "./oauth-session";

const attemptCookieName = "talent-signal.apple-attempt";

type AppleChallenge = {
  contract_version: unknown;
  challenge_id: unknown;
  nonce: unknown;
  expires_at: unknown;
};

export type AppleSignInExchange = {
  identityToken: string;
  givenName?: string;
  familyName?: string;
};

export async function prepareAppleSignIn(): Promise<string> {
  const challenge = (await postOAuthEndpoint(
    "/v1/auth/apple/challenges",
    { client_label: OAUTH_CLIENT_LABEL },
    "Apple",
  )) as AppleChallenge;
  if (
    challenge.contract_version !== CONTRACT_VERSION ||
    typeof challenge.challenge_id !== "string" ||
    typeof challenge.nonce !== "string" ||
    !Number.isFinite(Date.parse(String(challenge.expires_at))) ||
    Date.parse(String(challenge.expires_at)) <= Date.now()
  ) {
    throw new Error("Apple sign-in challenge is invalid.");
  }
  const value = await encode({
    secret: authSecret(),
    salt: attemptCookieName,
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    token: {
      challengeID: challenge.challenge_id,
      endpoint: backendAuthBaseUrl(),
      provider: "apple",
    },
  });
  (await cookies()).set(attemptCookieName, value, {
    httpOnly: true,
    sameSite: "none",
    path: "/",
    maxAge: OAUTH_ATTEMPT_COOKIE_TTL_SECONDS,
    secure: true,
  });
  return createHash("sha256").update(challenge.nonce).digest("hex");
}

export async function finishAppleSignIn(
  exchange: AppleSignInExchange,
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
    attempt.provider !== "apple" ||
    attempt.endpoint !== backendAuthBaseUrl()
  ) {
    throw new Error("Start Apple sign-in from the login page again.");
  }
  const session = (await postOAuthEndpoint(
    "/v1/auth/apple",
    {
      challenge_id: attempt.challengeID,
      identity_token: exchange.identityToken,
      client_label: OAUTH_CLIENT_LABEL,
      ...(exchange.givenName ? { given_name: exchange.givenName } : {}),
      ...(exchange.familyName ? { family_name: exchange.familyName } : {}),
    },
    "Apple",
  )) as SessionResponse;
  assertOAuthSession(session, "Apple");
  return verifyOAuthBackendSession(session, "Apple");
}

// Apple's `response_mode=form_post` callback is cross-site, so the Auth.js
// nonce cookie must be `Secure; SameSite=None`. The long-lived session cookie
// keeps its existing policy. Only the provider-tagged nonce changes.
export async function bindAppleNonce(
  authorizationURL: string,
  nonce: string,
): Promise<string> {
  const url = new URL(authorizationURL);
  if (url.origin !== "https://appleid.apple.com") {
    throw new Error("Unexpected Apple authorization endpoint.");
  }
  await writeOAuthNonceCookie({ value: nonce, provider: "apple", crossSite: true });
  url.searchParams.set("nonce", nonce);
  return url.toString();
}
