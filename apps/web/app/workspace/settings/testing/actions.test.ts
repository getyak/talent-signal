import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ primary: vi.fn(), request: vi.fn(), session: vi.fn(), clear: vi.fn(), set: vi.fn(), redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/server/backendAuth", () => ({ authSecret: () => "synthetic", backendAuthBaseUrl: () => "https://example.test" }));
vi.mock("@/lib/server/testWorkspaceBackend", () => ({ primaryAccount: mocks.primary, testWorkspaceRequest: mocks.request }));
vi.mock("@/lib/server/testWorkspaceSession", () => ({ testWorkspaceSession: mocks.session, clearTestWorkspaceSession: mocks.clear, setTestWorkspaceSession: mocks.set }));
import { leaveTestWorkspace, manageTestWorkspace } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.primary.mockResolvedValue({ backendAccountId: "owner" });
  mocks.session.mockResolvedValue({ workspaceId: "workspace", entryId: "entry" });
  mocks.request.mockResolvedValue({});
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); });
});
it("clears only local test state and redirects to sign-in when primary identity is missing", async () => {
  mocks.primary.mockRejectedValue(new TalentSignalHttpError(401, "AUTH_REQUIRED", "Sign in", null));
  await expect(leaveTestWorkspace()).rejects.toThrow("reason=backend_session_expired");
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.session).not.toHaveBeenCalled();
});
it("preserves the test cookie when a real backend leave needs retry", async () => {
  mocks.request.mockRejectedValue(new TalentSignalHttpError(503, "UNAVAILABLE", "Retry", null));
  await expect(leaveTestWorkspace()).rejects.toThrow("redirect:/workspace/settings/testing?leave=retry");
  expect(mocks.clear).not.toHaveBeenCalled();
});
it("clears local scope after a verified backend leave", async () => {
  await expect(leaveTestWorkspace()).rejects.toThrow("redirect:/workspace/settings/testing");
  expect(mocks.request).toHaveBeenCalledWith("/workspace/entries/entry/leave", {});
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it("keeps the current entry credential when a tab tries to enter another test workspace", async () => {
  mocks.primary.mockResolvedValue({ backendAccountId: "owner", backendUserId: "user" });
  const form = new FormData();
  for (const [key, value] of Object.entries({kind: "enter", operationId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222", parentAccountId: "owner", parentUserId: "user"})) form.set(key, value);
  expect(await manageTestWorkspace({}, form)).toEqual({ error: "请先返回我的空间，再进入另一个测试空间。" });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
});
