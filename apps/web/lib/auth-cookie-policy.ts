/**
 * Cookie `Secure` policy for the web deployment.
 *
 * Auth.js and the custom Google sign-in cookies hard-code
 * `secure: NODE_ENV === "production"`. That default stays in force. This
 * module only relaxes it for an explicitly opted-in private-LAN HTTP
 * deployment whose origin is provably local:
 *
 *   TALENT_SIGNAL_ALLOW_LAN_HTTP=true
 *   AUTH_URL=http://<literal RFC1918 IPv4 | loopback>
 *
 * See `docs/operations/testflight-local-backend.md` for the operating intent.
 */

const RFC1918_10 = /^10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const RFC1918_172 = /^172\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const RFC1918_192 = /^192\.168\.(\d{1,3})\.(\d{1,3})$/;

export type AuthCookieSecureDecision = {
  /** Value to pass to the cookie `secure` option. */
  secure: boolean;
  /** True only when the LAN-HTTP override was successfully applied. */
  lanHttpOverride: boolean;
  /** Stable, human-readable reason for the decision. */
  reason: string;
};

export type AuthCookieEnvironment = {
  NODE_ENV?: string | undefined;
  TALENT_SIGNAL_ALLOW_LAN_HTTP?: string | undefined;
  AUTH_URL?: string | undefined;
};

function isByte(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) return false;
  const parsed = Number(value);
  return parsed >= 0 && parsed <= 255;
}

function isRfc1918Ipv4(hostname: string): boolean {
  const ten = RFC1918_10.exec(hostname);
  if (ten) {
    return isByte(ten[1]!) && isByte(ten[2]!) && isByte(ten[3]!);
  }

  const oneSeventyTwo = RFC1918_172.exec(hostname);
  if (oneSeventyTwo) {
    const second = Number(oneSeventyTwo[1]);
    return (
      Number.isInteger(second) &&
      second >= 16 &&
      second <= 31 &&
      isByte(oneSeventyTwo[2]!) &&
      isByte(oneSeventyTwo[3]!)
    );
  }

  const oneNinetyTwo = RFC1918_192.exec(hostname);
  if (oneNinetyTwo) {
    return isByte(oneNinetyTwo[1]!) && isByte(oneNinetyTwo[2]!);
  }

  return false;
}

/**
 * Hostname must be a literal loopback address/name or a literal RFC1918 IPv4
 * address. DNS names, link-local, public IPs, IPv4-mapped IPv6, and broad
 * `172/8` ranges are rejected.
 */
function isAllowedLanHostname(hostname: string): boolean {
  if (hostname === "127.0.0.1") return true;
  if (hostname === "localhost") return true;
  if (hostname === "[::1]") return true;
  return isRfc1918Ipv4(hostname);
}

function rawAuthorityOf(rawUrl: string, schemeEnd: number): string | null {
  const remainder = rawUrl.slice(schemeEnd + 3);
  const boundary = remainder.search(/[/?#]/);
  return boundary === -1 ? remainder : remainder.slice(0, boundary);
}

function evaluateLanHttpAuthUrl(rawAuthUrl: string):
  | { ok: true }
  | { ok: false; reason: string } {
  if (rawAuthUrl.length === 0) {
    return {
      ok: false,
      reason: "AUTH_URL is empty; keep Secure cookies or set an explicit http origin",
    };
  }

  if (rawAuthUrl !== rawAuthUrl.trim()) {
    return {
      ok: false,
      reason: "AUTH_URL has surrounding whitespace; keep Secure cookies",
    };
  }

  let url: URL;
  try {
    url = new URL(rawAuthUrl);
  } catch {
    return {
      ok: false,
      reason: "AUTH_URL is not a parseable absolute URL; keep Secure cookies",
    };
  }

  if (url.protocol === "https:") {
    return { ok: false, reason: "AUTH_URL is https; HTTPS always keeps Secure" };
  }

  if (url.protocol !== "http:") {
    return {
      ok: false,
      reason: `AUTH_URL uses ${url.protocol}; only plain http can opt out of Secure`,
    };
  }

  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reason: "AUTH_URL contains userinfo; keep Secure cookies",
    };
  }

  if (url.search !== "" || url.hash !== "") {
    return {
      ok: false,
      reason: "AUTH_URL contains a query or fragment; keep Secure cookies",
    };
  }

  if (url.pathname !== "/") {
    return {
      ok: false,
      reason: "AUTH_URL has a non-root path; keep Secure cookies",
    };
  }

  // Reject forms that the URL parser silently rewrites (hex/octal/short IPv4,
  // control characters, percent-encoded hosts, expanded IPv6, trailing dots).
  // Only an authority that survives parsing byte-for-byte is trusted.
  const rawAuthority = rawAuthorityOf(rawAuthUrl, url.protocol.length - 1);
  if (rawAuthority === null || rawAuthority.toLowerCase() !== url.host.toLowerCase()) {
    return {
      ok: false,
      reason:
        "AUTH_URL host is not written in canonical literal form; keep Secure cookies",
    };
  }

  if (!isAllowedLanHostname(url.hostname)) {
    return {
      ok: false,
      reason:
        "AUTH_URL host is not a loopback or RFC1918 IPv4 literal; keep Secure cookies",
    };
  }

  return { ok: true };
}

/**
 * Pure decision for the cookie `Secure` flag.
 *
 * Default (production without a valid opt-in, or any non-production runtime)
 * is unchanged from `NODE_ENV === "production"`. Invalid opted-in
 * configuration fails closed: Secure stays enabled and `reason` explains the
 * rejection so callers can surface an actionable diagnostic.
 */
export function decideAuthCookieSecure(
  env: AuthCookieEnvironment = process.env,
): AuthCookieSecureDecision {
  if (env.NODE_ENV !== "production") {
    return {
      secure: false,
      lanHttpOverride: false,
      reason: "non-production runtime keeps Secure off",
    };
  }

  if (env.TALENT_SIGNAL_ALLOW_LAN_HTTP !== "true") {
    return {
      secure: true,
      lanHttpOverride: false,
      reason: "production default keeps Secure on",
    };
  }

  const authUrl = env.AUTH_URL;
  if (typeof authUrl !== "string") {
    return {
      secure: true,
      lanHttpOverride: false,
      reason:
        "TALENT_SIGNAL_ALLOW_LAN_HTTP=true requires AUTH_URL; Secure kept on",
    };
  }

  const evaluation = evaluateLanHttpAuthUrl(authUrl);
  if (!evaluation.ok) {
    return { secure: true, lanHttpOverride: false, reason: evaluation.reason };
  }

  return {
    secure: false,
    lanHttpOverride: true,
    reason: "explicit private-LAN http opt-in allows Secure off",
  };
}

/**
 * Convenience boolean for cookie option objects. Invalid opted-in config keeps
 * Secure enabled; the caller may read `decideAuthCookieSecure(...).reason` for
 * the operator-facing diagnostic.
 */
export function authCookieSecure(
  env: AuthCookieEnvironment = process.env,
): boolean {
  return decideAuthCookieSecure(env).secure;
}
