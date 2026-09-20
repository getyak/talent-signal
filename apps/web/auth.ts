import { TalentSignalHttpError } from "@talent-signal/contracts";
import NextAuth, { AuthError, CredentialsSignin } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import {
  appleFormPostCookiesSupported,
  deriveRegistrationDisplayName,
  emailSignInSchema,
  getAuthAvailability,
  getDefaultAccount,
  normalizeEmail,
  passwordRegistrationSchema,
  passwordSignInSchema,
  verifyConfiguredPassword,
} from "@/lib/auth-config";
import { backendSessionIsExpired } from "@/lib/backend-session";
import {
  AUTH_SESSION_COOKIE,
  authSecret,
  registerBackendAccount,
  signInBackendAccount,
} from "@/lib/server/backendAuth";
import { getGoogleOAuthCredentials } from "@/lib/server/google-oauth";

import { authCookieSecure } from "@/lib/auth-cookie-policy";
import { OAUTH_NONCE_COOKIE, OAuthAccountLinkRequired, oauthBackendClaims } from "@/lib/server/oauth-session";
import { finishGoogleSignIn } from "@/lib/server/google-session";
import { finishAppleSignIn } from "@/lib/server/apple-session";
import { getAppleOAuthCredentials } from "@/lib/server/apple-oauth";

class AccountLinkRequired extends AuthError { static type = "OAuthAccountNotLinked"; }
async function exchangeProviderSession<T>(exchange: () => Promise<T>): Promise<T> {
  try { return await exchange(); }
  catch (error) {
    if (error instanceof OAuthAccountLinkRequired) throw new AccountLinkRequired("Use the original sign-in method.");
    throw error;
  }
}

function applyBackendSessionToToken(
  token: Record<string, unknown>,
  backend: Awaited<ReturnType<typeof finishGoogleSignIn>>,
) {
  token.sub = backend.user.id;
  token.email = backend.user.email;
  token.name = backend.user.display_name;
  Object.assign(token, oauthBackendClaims(backend));
  return token;
}

function appleNameFields(profile: unknown, fallbackName?: string | null) {
  const raw = (profile as {
    user?: { name?: { firstName?: unknown; lastName?: unknown } };
  } | null)?.user;
  const firstName =
    typeof raw?.name?.firstName === "string" ? raw.name.firstName.trim() : "";
  const lastName =
    typeof raw?.name?.lastName === "string" ? raw.name.lastName.trim() : "";
  if (firstName) {
    return {
      givenName: firstName.slice(0, 100),
      ...(lastName ? { familyName: lastName.slice(0, 100) } : {}),
    };
  }
  const fallback = typeof fallbackName === "string" ? fallbackName.trim() : "";
  return fallback ? { givenName: fallback.slice(0, 100) } : {};
}

const credentialAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();
const credentialWindowMs = 60_000;
const credentialAttemptLimit = 6;

class AccountExistsCredentialsError extends CredentialsSignin {
  code = "account_exists";
}

class AccountServiceCredentialsError extends CredentialsSignin {
  code = "service_unavailable";
}

class RateLimitedCredentialsError extends CredentialsSignin {
  code = "rate_limited";
}

function canAttemptCredentialSignIn(email: string) {
  const now = Date.now();
  if (credentialAttempts.size > 500) {
    for (const [key, attempt] of credentialAttempts) {
      if (attempt.resetAt <= now) {
        credentialAttempts.delete(key);
      }
    }
    if (credentialAttempts.size > 500) {
      credentialAttempts.delete(credentialAttempts.keys().next().value ?? "");
    }
  }

  const current = credentialAttempts.get(email);

  if (!current || current.resetAt <= now) {
    credentialAttempts.set(email, {
      count: 1,
      resetAt: now + credentialWindowMs,
    });
    return true;
  }

  if (current.count >= credentialAttemptLimit) {
    return false;
  }

  current.count += 1;
  return true;
}

const providers: Provider[] = [
  Credentials({
    id: "password-account",
    name: "Talent Signal account",
    credentials: {
      mode: { label: "Mode", type: "text" },
      identifier: { label: "Username or email", type: "text" },
      username: { label: "Username", type: "text" },
      email: { label: "Email", type: "email" },
      displayName: { label: "Display name", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const availability = getAuthAvailability();
      if (
        credentials.mode === "register"
          ? !availability.registration
          : !availability.password
      ) {
        return null;
      }
      try {
        const backendSession =
          credentials.mode === "register"
            ? await (async () => {
                const parsed = passwordRegistrationSchema.safeParse(
                  credentials,
                );
                if (!parsed.success) return null;
                return registerBackendAccount({
                  username: parsed.data.username,
                  email: parsed.data.email,
                  display_name: deriveRegistrationDisplayName(
                    parsed.data.email,
                    parsed.data.displayName,
                  ),
                  password: parsed.data.password,
                });
              })()
            : await (async () => {
                const parsed = passwordSignInSchema.safeParse(credentials);
                if (!parsed.success) return null;
                return signInBackendAccount(parsed.data);
              })();
        if (!backendSession) return null;

        return {
          id: backendSession.user.id,
          email: backendSession.user.email,
          name: backendSession.user.display_name,
          backendAccessToken: backendSession.access_token,
          backendAccountId: backendSession.account.id,
          backendAccountName: backendSession.account.name,
          backendAccountSlug: backendSession.account.slug,
          backendExpiresAt: backendSession.expires_at,
          backendRole: backendSession.user.role,
          backendUserId: backendSession.user.id,
          backendUsername: backendSession.user.username,
        };
      } catch (error) {
        if (
          error instanceof TalentSignalHttpError &&
          error.code === "PASSWORD_ACCOUNT_EXISTS"
        ) {
          throw new AccountExistsCredentialsError();
        }
        if (
          error instanceof TalentSignalHttpError &&
          error.code === "PASSWORD_SIGN_IN_FAILED"
        ) {
          return null;
        }
        if (
          error instanceof TalentSignalHttpError &&
          (error.status === 429 || error.code === "RATE_LIMITED")
        ) {
          throw new RateLimitedCredentialsError();
        }
        throw new AccountServiceCredentialsError();
      }
    },
  }),
  Credentials({
    id: "email-password",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = emailSignInSchema.safeParse(credentials);
      const account = getDefaultAccount();
      if (!parsed.success || !account.emailPasswordEnabled) {
        return null;
      }

      const email = normalizeEmail(parsed.data.email);
      if (!canAttemptCredentialSignIn(email)) {
        throw new RateLimitedCredentialsError();
      }

      if (
        email !== account.email ||
        !verifyConfiguredPassword(
          parsed.data.password,
          account.passwordScrypt,
        )
      ) {
        return null;
      }

      credentialAttempts.delete(email);
      return {
        id: `configured:${account.email}`,
        email: account.email,
        name: account.name,
      };
    },
  }),
];

const googleCredentials = getGoogleOAuthCredentials();

if (googleCredentials) {
  providers.push(
    Google({
      clientId: googleCredentials.clientId,
      clientSecret: googleCredentials.clientSecret,
      checks: ["pkce", "state", "nonce"],
    }),
  );
}

const appleCredentials = appleFormPostCookiesSupported()
  ? getAppleOAuthCredentials()
  : null;

if (appleCredentials) {
  providers.push(
    Apple({
      clientId: appleCredentials.clientId,
      clientSecret: appleCredentials.clientSecret,
      checks: ["nonce", "state"],
    }),
  );
}

if (getDefaultAccount().quickLoginEnabled) {
  providers.push(
    Credentials({
      id: "default-account",
      name: "Default account",
      credentials: {},
      authorize() {
        const account = getDefaultAccount();
        if (!account.quickLoginEnabled) {
          return null;
        }

        return {
          id: `default:${account.email}`,
          email: account.email,
          name: account.name,
        };
      },
    }),
  );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  logger: {
    error(error) { console.error("Authentication failed:", error.name); },
  },
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        if (!account.id_token) throw new Error("Google did not return an identity token.");
        const backend = await exchangeProviderSession(() => finishGoogleSignIn(account.id_token!));
        return applyBackendSessionToToken(token, backend);
      }
      if (account?.provider === "apple") {
        if (!account.id_token) throw new Error("Apple did not return an identity token.");
        const backend = await exchangeProviderSession(() => finishAppleSignIn({
          identityToken: account.id_token!,
          ...appleNameFields(profile, user?.name),
        }));
        return applyBackendSessionToToken(token, backend);
      }
      if (user) {
        const backendUser = user as typeof user & {
          backendAccessToken?: string;
          backendAccountId?: string;
          backendAccountName?: string;
          backendAccountSlug?: string;
          backendExpiresAt?: string;
          backendRole?: "admin" | "member";
          backendUserId?: string;
          backendUsername?: string | null;
        };
        token.backendAccessToken = backendUser.backendAccessToken;
        token.backendAccountId = backendUser.backendAccountId;
        token.backendAccountName = backendUser.backendAccountName;
        token.backendAccountSlug = backendUser.backendAccountSlug;
        token.backendExpiresAt = backendUser.backendExpiresAt;
        token.backendRole = backendUser.backendRole;
        token.backendUserId = backendUser.backendUserId;
        token.backendUsername = backendUser.backendUsername;
      }
      return token;
    },
    session({ session, token }) {
      const publicSession = session as typeof session & {
        account?: {
          id: string;
          name: string;
          role: "admin" | "member";
          slug: string;
        };
      };
      if (
        typeof token.backendExpiresAt === "string" &&
        backendSessionIsExpired(token.backendExpiresAt)
      ) {
        delete (publicSession as unknown as { user?: unknown }).user;
        publicSession.account = undefined;
        return publicSession;
      }
      if (
        typeof token.backendAccountId === "string" &&
        typeof token.backendAccountName === "string" &&
        typeof token.backendAccountSlug === "string" &&
        (token.backendRole === "admin" || token.backendRole === "member")
      ) {
        publicSession.account = {
          id: token.backendAccountId,
          name: token.backendAccountName,
          role: token.backendRole,
          slug: token.backendAccountSlug,
        };
      }
      if (session.user && typeof token.backendUsername === "string") {
        (session.user as typeof session.user & { username?: string }).username =
          token.backendUsername;
      }
      return publicSession;
    },
  },
  cookies: {
    // Apple returns by cross-site POST; preserve its original onboarding destination.
    // Auth.js already adjusts state/nonce cookies for form_post; this cookie is separate.
    callbackUrl: { name: "talent-signal.callback-url", options: { httpOnly: true, path: "/",
      sameSite: appleCredentials && appleFormPostCookiesSupported() ? "none" : "lax",
      secure: Boolean(appleCredentials && appleFormPostCookiesSupported()) || authCookieSecure() } },
    nonce: { name: OAUTH_NONCE_COOKIE, options: { httpOnly: true, sameSite: "lax", path: "/", secure: authCookieSecure() } },
    sessionToken: {
      name: AUTH_SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: authCookieSecure(),
      },
    },
  },
  providers,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    maxAge: 60 * 60 * 8,
    strategy: "jwt",
  },
  secret: authSecret(),
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" ||
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.VERCEL),
});
