import { beforeEach, expect, it, vi } from "vitest";
const { claims, redirect } = vi.hoisted(() => ({ claims: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: claims }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/app/workspace/settings/testing/actions", () => ({ leaveTestWorkspace: vi.fn() }));
import Layout from "./layout";
beforeEach(() => { vi.clearAllMocks(); redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); }); });
it.each(["personal-owner", "lab-test"])("binds every standalone descendant to %s", async slug => {
  claims.mockResolvedValue({ backendAccountId: "rendered-account", backendAccountSlug: slug, backendAccountName: "Synthetic", backendExpiresAt: new Date(Date.now() + 60000).toISOString() });
  const result = await Layout({ children: "person-scoped-contact-agent" });
  expect(result.props["data-workspace-scope"]).toBe("rendered-account");
  expect(JSON.stringify(result)).toContain("person-scoped-contact-agent");
  expect(JSON.stringify(result).includes("返回我的空间")).toBe(slug.startsWith("lab-"));
});
it.each([null, { backendExpiresAt: "2000-01-01T00:00:00Z" }])("routes missing/expired scope to canonical recovery", async value => {
  claims.mockResolvedValue(value);
  await expect(Layout({ children: "private-controls" })).rejects.toThrow("redirect:/workspace/today");
});
it("routes invalid test cookies to canonical recovery", async () => {
  claims.mockRejectedValue(new Error("test cookie mismatch"));
  await expect(Layout({ children: "private-controls" })).rejects.toThrow("redirect:/workspace/today");
});
