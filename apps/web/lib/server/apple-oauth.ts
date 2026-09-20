import { createPrivateKey, sign, type KeyObject } from "node:crypto";

type Environment = Record<string, string | undefined>;

export type AppleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

const appleAudience = "https://appleid.apple.com";
const appleClientSecretTtlSeconds = 15 * 60;
// Apple caps a client secret at 15,777,000 seconds (six months): the `exp`
// claim may be at most that far into the future, and the token's total lifetime
// may not exceed it either. See
// https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
const appleClientSecretMaxLifetimeSeconds = 15_777_000;
// Require a little remaining validity so a token cannot expire mid-exchange.
const appleClientSecretMinRemainingSeconds = 60;
// Apple team and key identifiers are ten upper-case alphanumerics.
const appleTeamIdPattern = /^[A-Z0-9]{10}$/;
const appleKeyIdPattern = /^[A-Z0-9]{10}$/;
// Services IDs are reverse-DNS identifiers without spaces or separators
// beyond dots and hyphens.
const appleClientIdPattern = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/;
const appleClientSecretPattern =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApplePrivateKey(pem: string): KeyObject | null {
  try {
    // Environment injection often escapes newlines in a single-line value.
    const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType !== "ec") return null;
    if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    return key;
  } catch {
    return null;
  }
}

function createAppleClientSecret(
  clientId: string,
  teamId: string,
  keyId: string,
  privateKey: KeyObject,
  nowSeconds: number,
): string | null {
  const header = base64UrlEncode(
    JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: teamId,
      iat: nowSeconds,
      exp: nowSeconds + appleClientSecretTtlSeconds,
      aud: appleAudience,
      sub: clientId,
    }),
  );
  const signingInput = `${header}.${payload}`;

  try {
    const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
      key: privateKey,
      // JWT ES256 requires the raw 64-byte R||S form, not DER.
      dsaEncoding: "ieee-p1363",
    });
    return `${signingInput}.${base64UrlEncode(signature)}`;
  } catch {
    return null;
  }
}

/**
 * Local metadata check for a supplied static Apple client secret. It confirms
 * the JWT is well-formed, uses ES256 with a key identifier, is addressed to
 * Apple for exactly this Services ID from a team-shaped issuer, and is still
 * valid within Apple's 15,777,000-second (six-month) ceiling. It cannot prove
 * Apple authorized the signing key; only Apple's token endpoint can, by
 * accepting or rejecting the secret at exchange time.
 */
function staticClientSecretIsUsable(
  clientSecret: string,
  clientId: string,
  nowSeconds: number,
): boolean {
  if (!appleClientSecretPattern.test(clientSecret)) return false;

  const segments = clientSecret.split(".");
  if (segments.length !== 3) return false;

  const header = decodeJsonSegment(segments[0]);
  const payload = decodeJsonSegment(segments[1]);
  if (!isRecord(header) || !isRecord(payload)) return false;

  if (header.alg !== "ES256") return false;
  if (typeof header.kid !== "string" || !appleKeyIdPattern.test(header.kid)) {
    return false;
  }
  if (payload.aud !== appleAudience) return false;
  if (payload.sub !== clientId) return false;
  if (typeof payload.iss !== "string" || !appleTeamIdPattern.test(payload.iss)) {
    return false;
  }

  const { iat, exp } = payload;
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) return false;
  const issuedAt = iat as number;
  const expiresAt = exp as number;
  if (issuedAt <= 0) return false;
  // Allow small clock skew, but reject a token issued in the future.
  if (issuedAt > nowSeconds + 300) return false;
  if (expiresAt <= issuedAt) return false;
  if (expiresAt - issuedAt > appleClientSecretMaxLifetimeSeconds) return false;
  if (expiresAt - nowSeconds > appleClientSecretMaxLifetimeSeconds) return false;
  if (expiresAt - nowSeconds < appleClientSecretMinRemainingSeconds) {
    return false;
  }
  return true;
}

/**
 * Web Services ID (`AUTH_APPLE_ID`) plus its client secret.
 *
 * Preferred: `AUTH_APPLE_TEAM_ID`, `AUTH_APPLE_KEY_ID`, and
 * `AUTH_APPLE_PRIVATE_KEY` (PEM P-256 `.p8`). A fresh 15-minute ES256 client
 * secret is generated on every call, so a long-running process never reuses an
 * expired token. Supplying any private-key setting requires the complete set.
 *
 * Legacy: `AUTH_APPLE_SECRET` supplies a pre-generated client-secret JWT that
 * is validated for local metadata only.
 *
 * Missing, partial, or malformed configuration returns null. Nothing is logged
 * and no secret or error detail is surfaced. The backend independently trusts
 * the Web Services ID and the native bundle ID through
 * `APPLE_SIGN_IN_AUDIENCES`.
 */
export function getAppleOAuthCredentials(
  environment: Environment = process.env,
): AppleOAuthCredentials | null {
  const clientId = environment.AUTH_APPLE_ID?.trim();
  if (!clientId || !appleClientIdPattern.test(clientId)) {
    return null;
  }

  const teamId = environment.AUTH_APPLE_TEAM_ID?.trim();
  const keyId = environment.AUTH_APPLE_KEY_ID?.trim();
  const privateKeyPem = environment.AUTH_APPLE_PRIVATE_KEY?.trim();
  // Presence, not value: any supplied key setting requires the complete set.
  const hasPrivateKeySettings =
    environment.AUTH_APPLE_TEAM_ID !== undefined ||
    environment.AUTH_APPLE_KEY_ID !== undefined ||
    environment.AUTH_APPLE_PRIVATE_KEY !== undefined;

  if (hasPrivateKeySettings) {
    // A partial key configuration must never silently fall back to a static
    // secret; it is unavailable until the full set is supplied.
    if (!teamId || !keyId || !privateKeyPem) return null;
    if (!appleTeamIdPattern.test(teamId) || !appleKeyIdPattern.test(keyId)) {
      return null;
    }

    const privateKey = parseApplePrivateKey(privateKeyPem);
    if (!privateKey) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const clientSecret = createAppleClientSecret(
      clientId,
      teamId,
      keyId,
      privateKey,
      nowSeconds,
    );
    return clientSecret ? { clientId, clientSecret } : null;
  }

  const clientSecret = environment.AUTH_APPLE_SECRET?.trim();
  if (!clientSecret) return null;
  if (
    !staticClientSecretIsUsable(
      clientSecret,
      clientId,
      Math.floor(Date.now() / 1000),
    )
  ) {
    return null;
  }

  return { clientId, clientSecret };
}
