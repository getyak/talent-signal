import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { auth, loadLabManifest } = vi.hoisted(() => ({
  auth: vi.fn(),
  loadLabManifest: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/login/actions", () => ({ signOutOfWorkspace: vi.fn() }));
vi.mock("@/lib/server/labBackend", () => ({ loadLabManifest }));
vi.mock("@/components/workspace-shell-nav", () => ({
  WorkspaceShellNav: () => null,
  WorkspaceCaptureLink: () => null,
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/talent-signal-lab/lab-shell", () => ({
  TalentSignalLabShell: ({ children }: { children: React.ReactNode }) => children,
}));

import WorkspaceLayout from "@/app/workspace/layout";

describe("workspace critical loading path", () => {
  afterEach(() => vi.resetAllMocks());

  it("renders the account and product when Lab never responds", async () => {
    auth.mockResolvedValue({ user: { name: "Synthetic Recruiter" }, account: { name: "Fixture", slug: "fixture-alpha" } });
    loadLabManifest.mockImplementation(() => new Promise(() => {}));
    const layout = await WorkspaceLayout({ children: createElement("main", null, "Current product state") });
    const html = renderToStaticMarkup(layout);
    expect(html).toContain("Current product state");
    expect(html).toContain("Synthetic Recruiter");
    expect(loadLabManifest).not.toHaveBeenCalled();
  });

  it("leaves unauthenticated redirects to the child without loading Lab", async () => {
    auth.mockResolvedValue(null);
    const child = createElement("main", null, "Authentication boundary");
    expect(await WorkspaceLayout({ children: child })).toBe(child);
    expect(loadLabManifest).not.toHaveBeenCalled();
  });
});
