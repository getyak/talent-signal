import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, TalentSignalHttpError } from "@talent-signal/contracts";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), save: vi.fn(), preview: vi.fn(), revalidate: vi.fn() }));
vi.mock("@talent-signal/contracts", async importOriginal => {
  const actual = await importOriginal<typeof import("@talent-signal/contracts")>();
  return { ...actual, TalentSignalClient: class { updateAccountOnboarding = mocks.save; previewAccountOnboarding = mocks.preview; } };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: mocks.claims, backendAuthBaseUrl: () => "http://127.0.0.1:4317" }));
vi.mock("@/lib/server/workspaceSessions", () => ({ workspaceSessionsBinding: () => "session-bound" }));
import { previewOnboarding, saveOnboarding } from "./actions";
const scope = { accountId: "account-a", userId: "user-a", binding: "session-bound" };
const input = { id: "92d7e65d-eded-4691-a2e6-9a6ae2575ec8", expected_revision: 1, display_name: "Synthetic owner", focus: "", profile_url: "", status: "completed" as const };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ backendAccountId: scope.accountId, backendUserId: scope.userId,
    backendAccessToken: "synthetic-token", backendExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  mocks.save.mockResolvedValue({ contract_version: CONTRACT_VERSION, account_id: scope.accountId, user_id: scope.userId, ...input, revision: 2 });
});
describe("onboarding session and result boundary", () => {
  it("rejects stale tabs before a save or public page read", async () => {
    const stale = { ...scope, binding: "old-login" };
    expect(await saveOnboarding(stale, input)).toMatchObject({ recovery: "login" });
    expect(await previewOnboarding(stale, "https://example.com/about")).toHaveProperty("error");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("denies a cross-user form in the same workspace", async () => {
    await saveOnboarding({ ...scope, userId: "other-user" }, input);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("sends the exact idempotency key and clearable optional fields", async () => {
    expect((await saveOnboarding(scope, input)).data?.revision).toBe(2);
    expect(mocks.save).toHaveBeenCalledWith(input, expect.any(AbortSignal)); expect(mocks.revalidate).toHaveBeenCalled();
  });
  it("keeps ambiguous network outcomes retryable and stale revisions distinct", async () => {
    mocks.save.mockRejectedValueOnce(new TypeError("Network failed"));
    expect(await saveOnboarding(scope, input)).toMatchObject({ recovery: "retry" });
    mocks.save.mockRejectedValueOnce(new TalentSignalHttpError(409, "ACCOUNT_STALE", "stale", null));
    expect(await saveOnboarding(scope, input)).toMatchObject({ recovery: "refresh" });
  });
  it("does not claim success for a mismatched backend identity", async () => {
    mocks.save.mockResolvedValueOnce({ account_id: "other-account", user_id: scope.userId });
    expect(await saveOnboarding(scope, input)).toMatchObject({ recovery: "login" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not report success when an old operation returns newer profile data", async () => {
    mocks.save.mockResolvedValueOnce({ contract_version: CONTRACT_VERSION, account_id: scope.accountId, user_id: scope.userId, ...input, revision: 3 });
    expect(await saveOnboarding(scope, input)).toMatchObject({ recovery: "refresh" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("blocks URLs carrying credentials or a non-HTTPS scheme before dispatch", async () => {
    for (const url of ["http://example.com", "https://owner:secret@example.com", "javascript:alert(1)"]) {
      expect(await previewOnboarding(scope, url)).toHaveProperty("error");
    }
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("returns a draft preview without writing personal data", async () => {
    mocks.preview.mockResolvedValueOnce({ contract_version: CONTRACT_VERSION, profile_url: "https://example.com/about", excerpt: "Synthetic public introduction", retrieved_at: new Date().toISOString() });
    expect((await previewOnboarding(scope, "https://example.com/about")).preview?.excerpt).toBe("Synthetic public introduction");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
