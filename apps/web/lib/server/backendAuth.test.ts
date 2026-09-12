import { afterEach, describe, expect, it, vi } from "vitest";

const { getToken, expected } = vi.hoisted(() => ({ getToken: vi.fn(), expected: { value: "" } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(expected.value ? {"x-talent-signal-workspace":expected.value} : {}), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { authenticatedBackendClient, readBackendSessionClaims } from "./backendAuth";

function claims(account: string, expiresAt: string) {
  return {
    backendAccessToken: `synthetic-${account}`, backendAccountId: account,
    backendAccountName: account, backendAccountSlug: `fixture-${account}`,
    backendExpiresAt: expiresAt, backendRole: "member", backendUserId: account,
    backendUsername: null,
  };
}

describe("request-only identity memoization", () => {
  afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); expected.value = ""; });

  it("does not reuse identity outside a React server render", async () => {
    const expiry = new Date(Date.now() + 60000).toISOString();
    getToken.mockResolvedValueOnce(claims("a", expiry)).mockResolvedValueOnce(claims("b", expiry)).mockResolvedValueOnce(null);
    expect((await readBackendSessionClaims())?.backendAccountId).toBe("a");
    expect((await readBackendSessionClaims())?.backendAccountId).toBe("b");
    expect(await readBackendSessionClaims()).toBeNull();
  });

  it("rejects a stale rendered test workspace after another tab returns to owner", async () => {
    expected.value = "old-test";
    getToken.mockResolvedValue(claims("owner", new Date(Date.now()+60000).toISOString()));
    await expect(readBackendSessionClaims()).rejects.toMatchObject({ code: "backend_session_expired" });
  });

  it("rejects a bound request after backend claims disappear instead of enabling fixture fallback", async () => {
    expected.value = "old-test";
    getToken.mockResolvedValue(null);
    await expect(authenticatedBackendClient()).rejects.toMatchObject({ code: "backend_session_expired" });
    expected.value = "";
    expect(await authenticatedBackendClient()).toBeNull();
  });

  it("checks expiry at client use time even when the decoded token is unchanged", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    getToken.mockResolvedValue(claims("a", new Date(start + 60000).toISOString()));
    expect(await authenticatedBackendClient()).not.toBeNull();
    vi.setSystemTime(start + 120000);
    await expect(authenticatedBackendClient()).rejects.toMatchObject({ code: "backend_session_expired" });
  });
});
