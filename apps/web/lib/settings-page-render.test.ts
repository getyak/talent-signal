import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { auth, loadAccountSettings, claims } = vi.hoisted(() => ({
  auth: vi.fn(),
  loadAccountSettings: vi.fn(),
  claims: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/lib/server/accountBackend", () => ({ loadAccountSettings }));
vi.mock("@/lib/server/backendAuth", () => ({
  readBackendSessionClaims: claims,
  authSecret: () => "settings-page-render-test-secret",
}));
vi.mock("@/lib/server/contact-handoff-session", () => ({
  contactHandoffSessionVersion: () => "session-version",
}));

import SettingsPage from "@/app/workspace/settings/page";

const account = {
  contract_version: "1.0.0",
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@example.com",
    display_name: "林顾问",
    username: null,
    kind: "human",
    revision: 1,
    login_methods: ["password"],
  },
  workspace: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Alpha 寻访测试",
    slug: "fixture-alpha",
    revision: 1,
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    role: "owner",
    is_owner: true,
    can_manage: true,
    is_test: true,
  },
  sessions: [],
  members: [],
  activity: [],
  lab_enabled: true,
};

describe("settings page server composition", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders every section from the server without calling a client predicate", async () => {
    auth.mockResolvedValue({ user: { name: "林顾问" } });
    loadAccountSettings.mockResolvedValue(account);
    claims.mockResolvedValue({
      backendAccountId: "22222222-2222-4222-8222-222222222222",
      backendExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    for (const section of [
      "account",
      "workspace",
      "appearance",
      "connections",
      "advanced",
      "testing",
    ]) {
      const html = renderToStaticMarkup(
        await SettingsPage({ searchParams: Promise.resolve({ section }) }),
      );
      expect(html).toContain("设置");
      expect(html).toContain("账号与安全");
    }
  });

  it("falls back to the account section when the query is unknown or testing is disabled", async () => {
    auth.mockResolvedValue({ user: { name: "林顾问" } });
    loadAccountSettings.mockResolvedValue({ ...account, lab_enabled: false });
    claims.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await SettingsPage({
        searchParams: Promise.resolve({ section: "testing" }),
      }),
    );
    expect(html).toContain("账号与安全");
    expect(html).not.toContain("测试与诊断");
  });

  it("renders a truthful unavailable pane when settings cannot be read", async () => {
    auth.mockResolvedValue({ user: { name: "林顾问" } });
    loadAccountSettings.mockRejectedValue(new Error("offline"));
    claims.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await SettingsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("账号设置暂时无法连接");
  });
});
