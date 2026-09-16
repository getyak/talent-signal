const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validReturnSessionId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value)
    ? value.toLowerCase()
    : null;
}

export function withReturnSession(
  href: string,
  returnSessionId: string | null,
): string {
  if (!returnSessionId) return href;
  const url = new URL(href, "https://talent-signal.invalid");
  url.searchParams.set("session", returnSessionId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function sessionReturnHref(returnSessionId: string | null): string | null {
  return returnSessionId
    ? `/workspace/sessions/${encodeURIComponent(returnSessionId)}`
    : null;
}

