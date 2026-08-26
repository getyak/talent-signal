import { TalentSignalHttpError } from "@talent-signal/contracts";
import NextAuth, { CredentialsSignin } from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import {
  emailSignInSchema,
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
                  display_name: parsed.data.displayName,
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
        return null;
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
    }),
  );
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
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
  callbacks: {
    jwt({ token, user }) {
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
    sessionToken: {
      name: AUTH_SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers,
  pages: {
    signIn: "/login",
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
