type Environment = Record<string, string | undefined>;

export type AppleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

// Sign in with Apple client secrets are short-lived ES256 JWTs generated from
// a .p8 key. This is a shape check only; correctness is proven by Apple at
// exchange time, and missing/invalid config stays unavailable.
const appleClientSecretPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Web Services ID (`AUTH_APPLE_ID`) plus its generated client secret
 * (`AUTH_APPLE_SECRET`). The backend independently trusts the Web Services ID
 * and the native bundle ID through `APPLE_SIGN_IN_AUDIENCES`.
 */
export function getAppleOAuthCredentials(
  environment: Environment = process.env,
): AppleOAuthCredentials | null {
  const clientId = environment.AUTH_APPLE_ID?.trim();
  const clientSecret = environment.AUTH_APPLE_SECRET?.trim();

  if (
    !clientId ||
    /\s/.test(clientId) ||
    !clientSecret ||
    !appleClientSecretPattern.test(clientSecret)
  ) {
    return null;
  }

  return { clientId, clientSecret };
}
