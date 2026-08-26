"use client";

export const WORKSPACE_SESSION_EXPIRED_EVENT =
  "talent-signal:workspace-session-expired";

function responseCode(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  if ("code" in payload) return payload.code;
  if (
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "code" in payload.error
  ) {
    return payload.error.code;
  }
  return null;
}

export function workspaceSessionExpired(
  status: number,
  payload: unknown,
): boolean {
  return status === 401 && responseCode(payload) === "backend_session_expired";
}

export async function workspaceSessionFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  request: typeof fetch = fetch,
): Promise<Response> {
  const response = await request(input, init);
  if (response.status !== 401) return response;
  try {
    const payload = (await response.clone().json()) as unknown;
    if (
      workspaceSessionExpired(response.status, payload) &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event(WORKSPACE_SESSION_EXPIRED_EVENT));
    }
  } catch {
    // A malformed 401 remains with its caller and does not claim expiry.
  }
  return response;
}

// Compatibility names keep relationship feature call sites descriptive while
// Pursuit and future workspace clients share the same response boundary.
export const RELATIONSHIP_SESSION_EXPIRED_EVENT =
  WORKSPACE_SESSION_EXPIRED_EVENT;
export const relationshipIntegrationSessionExpired = workspaceSessionExpired;
export const relationshipIntegrationFetch = workspaceSessionFetch;
