export function isAllowedMutationOrigin(
  headers: Headers,
  production = process.env.NODE_ENV === "production",
) {
  const origin = headers.get("origin");
  if (!origin) {
    return !production;
  }

  const requestHost = headers.get("host");
  if (!requestHost) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const forwarded = headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      ?.trim()
      .toLowerCase();
    const expectedProtocol = forwarded === "http" || forwarded === "https"
      ? `${forwarded}:`
      : production
        ? "https:"
        : "http:";
    return parsed.host === requestHost && parsed.protocol === expectedProtocol;
  } catch {
    return false;
  }
}
