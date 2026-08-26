import "server-only";

import {
  TalentSignalClient,
  type PasswordLoginRequest,
  type PasswordRegistrationRequest,
  type SessionResponse,
} from "@talent-signal/contracts";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

import {
  BackendSessionExpiredError,
  backendSessionIsExpired,
} from "@/lib/backend-session";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export const AUTH_SESSION_COOKIE = "talent-signal.session-v2";

export function authSecret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production.");
  }
  return "talent-signal-local-development-secret-v2";
}

export function backendAuthBaseUrl(): string {
  const parsed = new URL(
    process.env.TALENT_SIGNAL_BACKEND_URL?.trim() ??
      "http://127.0.0.1:4317",
  );
  if (parsed.protocol === "https:") return parsed.origin;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return parsed.origin;
  }
  throw new Error(
    "Password authentication must use HTTPS, except for an explicit loopback backend.",
  );
}

function authClient() {
  return new TalentSignalClient(backendAuthBaseUrl());
}

export async function signInBackendAccount(
  request: Omit<PasswordLoginRequest, "client_label">,
): Promise<SessionResponse> {
  return authClient().signInWithPassword({
    ...request,
    client_label: "talent-signal-web",
  });
}

export async function registerBackendAccount(
  request: Omit<PasswordRegistrationRequest, "client_label">,
): Promise<SessionResponse> {
  return authClient().registerWithPassword({
    ...request,
    client_label: "talent-signal-web",
  });
}

export type BackendSessionClaims = {
  backendAccessToken: string;
  backendAccountId: string;
  backendAccountName: string;
  backendAccountSlug: string;
  backendExpiresAt: string;
  backendRole: "admin" | "member";
  backendUserId: string;
  backendUsername: string | null;
};

export async function readBackendSessionClaims(): Promise<BackendSessionClaims | null> {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch (caught) {
    if (
      caught instanceof Error &&
      (caught.message.includes("outside a request scope") ||
        ("__NEXT_ERROR_CODE" in caught &&
          caught.__NEXT_ERROR_CODE === "E251"))
    ) {
      return null;
    }
    throw caught;
  }
  const token = await getToken({
    req: { headers: requestHeaders },
    cookieName: AUTH_SESSION_COOKIE,
    salt: AUTH_SESSION_COOKIE,
    secret: authSecret(),
  });
  if (
    !token ||
    typeof token.backendAccessToken !== "string" ||
    typeof token.backendAccountId !== "string" ||
    typeof token.backendAccountName !== "string" ||
    typeof token.backendAccountSlug !== "string" ||
    typeof token.backendExpiresAt !== "string" ||
    (token.backendRole !== "admin" && token.backendRole !== "member") ||
    typeof token.backendUserId !== "string" ||
    !(
      typeof token.backendUsername === "string" ||
      token.backendUsername === null
    )
  ) {
    return null;
  }
  return {
    backendAccessToken: token.backendAccessToken,
    backendAccountId: token.backendAccountId,
    backendAccountName: token.backendAccountName,
    backendAccountSlug: token.backendAccountSlug,
    backendExpiresAt: token.backendExpiresAt,
    backendRole: token.backendRole,
    backendUserId: token.backendUserId,
    backendUsername: token.backendUsername,
  };
}

export async function authenticatedBackendClient(): Promise<TalentSignalClient | null> {
  const claims = await readBackendSessionClaims();
  if (!claims) {
    return null;
  }
  if (backendSessionIsExpired(claims.backendExpiresAt)) {
    throw new BackendSessionExpiredError();
  }
  return new TalentSignalClient(
    backendAuthBaseUrl(),
    claims.backendAccessToken,
  );
}
