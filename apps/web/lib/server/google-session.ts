import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";
import { CONTRACT_VERSION, TalentSignalClient, type SessionResponse } from "@talent-signal/contracts";
import { authSecret, backendAuthBaseUrl } from "./backendAuth";

export const GOOGLE_NONCE_COOKIE = "talent-signal.google-nonce";
const cookieName = "talent-signal.google-attempt";
const clientLabel = "talent-signal-web";
async function post(path: string, body: unknown) {
  const response = await fetch(`${backendAuthBaseUrl()}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Google workspace sign-in could not be completed.");
  return response.json();
}

export async function prepareGoogleSignIn() {
  const challenge = await post("/v1/auth/google/challenges", { client_label: clientLabel });
  if (challenge.contract_version !== CONTRACT_VERSION || typeof challenge.challenge_id !== "string" ||
      typeof challenge.nonce !== "string" || !Number.isFinite(Date.parse(challenge.expires_at)) || Date.parse(challenge.expires_at) <= Date.now()) {
    throw new Error("Google sign-in challenge is invalid.");
  }
  const value = await encode({ secret: authSecret(), salt: cookieName, maxAge: 300,
    token: { challengeID: challenge.challenge_id, endpoint: backendAuthBaseUrl() } });
  (await cookies()).set(cookieName, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300,
    secure: process.env.NODE_ENV === "production" });
  return createHash("sha256").update(challenge.nonce).digest("hex");
}

export async function finishGoogleSignIn(identityToken: string): Promise<SessionResponse> {
  const jar = await cookies();
  const value = jar.get(cookieName)?.value;
  jar.delete(cookieName);
  const attempt = value ? await decode({ token: value, secret: authSecret(), salt: cookieName }) : null;
  if (!attempt || typeof attempt.challengeID !== "string" || attempt.endpoint !== backendAuthBaseUrl()) {
    throw new Error("Start Google sign-in from the login page again.");
  }
  const session = await post("/v1/auth/google", { challenge_id: attempt.challengeID,
    identity_token: identityToken, client_label: clientLabel }) as SessionResponse;
  if (session.contract_version !== CONTRACT_VERSION || !session.access_token ||
      !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) throw new Error("Invalid Google workspace session.");
  const verified = await new TalentSignalClient(backendAuthBaseUrl(), session.access_token).currentSession();
  if (verified.account.id !== session.account.id || verified.user.id !== session.user.id) {
    throw new Error("Google workspace session does not match the signed-in account.");
  }
  return session;
}

// Auth.js owns state and PKCE. Bind its OIDC nonce check to the server-issued
// challenge, preserving the provider-tagged encrypted cookie format in beta.32.
export async function bindGoogleNonce(authorizationURL: string, nonce: string) {
  const url = new URL(authorizationURL);
  if (url.origin !== "https://accounts.google.com") throw new Error("Unexpected Google authorization endpoint.");
  const value = await encode({ secret: authSecret(), salt: GOOGLE_NONCE_COOKIE, maxAge: 300,
    token: { value: nonce, provider: "google" } });
  (await cookies()).set(GOOGLE_NONCE_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300,
    secure: process.env.NODE_ENV === "production" });
  url.searchParams.set("nonce", nonce);
  return url.toString();
}
