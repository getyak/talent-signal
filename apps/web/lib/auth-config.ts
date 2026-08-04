import { scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const configuredPasswordPattern =
  /^scrypt\$([a-f0-9]{32,128})\$([a-f0-9]{128})$/i;

export const emailSignInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export type DefaultAccount = {
  email: string;
  emailPasswordEnabled: boolean;
  enabled: boolean;
  name: string;
  passwordScrypt?: string;
  quickLoginEnabled: boolean;
};

type Environment = Record<string, string | undefined>;
type AuthAvailabilityOverrides = {
  google?: boolean;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function safeRedirectTarget(
  value: FormDataEntryValue | null | undefined,
  fallback = "/workspace",
) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  return value;
}

export function getDefaultAccount(
  environment: Environment = process.env,
): DefaultAccount {
  const name = environment.AUTH_DEFAULT_ACCOUNT_NAME?.trim() ?? "";
  const email = normalizeEmail(
    environment.AUTH_DEFAULT_ACCOUNT_EMAIL?.trim() ?? "",
  );
  const passwordScrypt =
    environment.AUTH_DEFAULT_ACCOUNT_PASSWORD_SCRYPT?.trim();
  const enabled =
    environment.AUTH_DEFAULT_ACCOUNT_ENABLED === "true" &&
    name.length > 0 &&
    z.string().email().safeParse(email).success;

  return {
    email,
    emailPasswordEnabled:
      enabled &&
      typeof passwordScrypt === "string" &&
      configuredPasswordPattern.test(passwordScrypt),
    enabled,
    name,
    passwordScrypt,
    quickLoginEnabled:
      enabled &&
      environment.AUTH_DEFAULT_ACCOUNT_QUICK_LOGIN === "true",
  };
}

export function getAuthAvailability(
  environment: Environment = process.env,
  overrides: AuthAvailabilityOverrides = {},
) {
  const account = getDefaultAccount(environment);

  return {
    apple: Boolean(
      environment.AUTH_APPLE_ID?.trim() &&
        environment.AUTH_APPLE_SECRET?.trim(),
    ),
    defaultAccount: account.quickLoginEnabled,
    defaultAccountEmail: account.email,
    defaultAccountName: account.name,
    email: account.emailPasswordEnabled,
    google:
      overrides.google ??
      Boolean(
        environment.AUTH_GOOGLE_ID?.trim() &&
          environment.AUTH_GOOGLE_SECRET?.trim(),
      ),
  };
}

export function encodeConfiguredPassword(password: string, salt: string) {
  const normalizedSalt = salt.toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(normalizedSalt)) {
    throw new Error("Password salt must be 16-64 bytes of hexadecimal.");
  }

  const hash = scryptSync(password, normalizedSalt, 64).toString("hex");
  return `scrypt$${normalizedSalt}$${hash}`;
}

export function verifyConfiguredPassword(
  password: string,
  encoded: string | undefined,
) {
  if (!encoded) {
    return false;
  }

  const match = configuredPasswordPattern.exec(encoded);
  if (!match) {
    return false;
  }

  const [, salt, expectedHex] = match;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}
