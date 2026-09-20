export const ONBOARDING_PROFILE_URL_ERROR = "请填写公开的主页链接，例如 example.com 或 https://example.com/about。";

/** Add the omitted HTTPS scheme without changing paths or silently stripping credentials.
 * This is input assistance; the backend still owns DNS/IP/redirect/robots checks.
 */
export function normalizeOnboardingProfileUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  if (value.length > 2000 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return null;
  const candidate = /^https:\/\//iu.test(value)
    ? value
    : /^[^:/?#]+\.[^:/?#]+(?::\d+)?(?:[/?#]|$)/u.test(value)
      ? `https://${value}`
      : null;
  if (!candidate || candidate.length > 2000) return null;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password ||
        !host.includes(".") || host.endsWith(".") || /^[\d.]+$/u.test(host) || host.includes(":") ||
        host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    return candidate;
  } catch { return null; }
}
