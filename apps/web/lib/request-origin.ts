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
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}
