import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import {
  emailSignInSchema,
  getDefaultAccount,
  normalizeEmail,
  verifyConfiguredPassword,
} from "@/lib/auth-config";
import { getGoogleOAuthCredentials } from "@/lib/server/google-oauth";

const credentialAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();
const credentialWindowMs = 60_000;
const credentialAttemptLimit = 6;

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
  providers,
  pages: {
    signIn: "/login",
  },
  session: {
    maxAge: 60 * 60 * 24 * 7,
    strategy: "jwt",
  },
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "talent-signal-local-development-secret"),
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" ||
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.VERCEL),
});
