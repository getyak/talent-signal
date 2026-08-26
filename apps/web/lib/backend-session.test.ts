import { describe, expect, it } from "vitest";

import {
  BackendSessionExpiredError,
  backendSessionRecoveryHref,
  backendSessionIsExpired,
  isBackendSessionExpiredError,
} from "./backend-session";

describe("backend session boundary", () => {
  it("treats an elapsed backend session as expired", () => {
    expect(
      backendSessionIsExpired("2026-08-26T08:00:00.000Z", 1_788_000_000_001),
    ).toBe(true);
  });

  it("treats malformed expiration data as expired rather than active", () => {
    expect(backendSessionIsExpired("not-a-date")).toBe(true);
  });

  it("keeps the expired state distinct from a missing legacy backend session", () => {
    const error = new BackendSessionExpiredError();
    expect(error.name).toBe("BackendSessionExpiredError");
    expect(error.status).toBe(401);
    expect(error.code).toBe("backend_session_expired");
    expect(isBackendSessionExpiredError(error)).toBe(true);
    expect(
      backendSessionRecoveryHref("/workspace?surface=desk"),
    ).toBe(
      "/login?callbackUrl=%2Fworkspace%3Fsurface%3Ddesk&reason=backend_session_expired",
    );
  });
});
