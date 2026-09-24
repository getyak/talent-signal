// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

const conflictActions = vi.hoisted(() => ({
  prepareConflictRecovery: vi.fn(),
  confirmConflictRecovery: vi.fn(),
  cancelConflictRecovery: vi.fn(),
  startConflictProviderVerification: vi.fn(),
}));
vi.mock("@/app/workspace/settings/conflict/actions", () => conflictActions);
vi.mock("@/app/workspace/settings/login-methods/actions", () => ({
  startDuplicateProof: vi.fn(),
  startProviderReauth: vi.fn(),
  saveAccountPassword: vi.fn(),
  unlinkLoginMethod: vi.fn(),
  startPasswordStepUpLink: vi.fn(),
  completeStagedPassword: vi.fn(),
  continueTargetLink: vi.fn(),
  completeStagedUnlink: vi.fn(),
}));

import { AccountConflictRecovery, inventorySummary } from "./account-conflict-recovery";
import type { AccountSettings, ReconciliationRecord } from "@talent-signal/contracts";
import { CONTRACT_VERSION } from "@talent-signal/contracts";

function settings(overrides: Partial<AccountSettings> = {}): AccountSettings {
  return {
    contract_version: CONTRACT_VERSION,
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "shared@example.test",
      display_name: "Owner",
      username: null,
      kind: "google_human",
      revision: 2,
      login_methods: ["google"],
      email_verified_at: null,
    },
    sign_in_methods: [
      { provider: "apple", state: "unconnected", hint: null, can_unlink: false },
      { provider: "google", state: "connected", hint: null, can_unlink: true },
      { provider: "password", state: "unconnected", hint: null, can_unlink: false },
    ],
    email_ownership_state: "conflict",
    workspace: {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Workspace",
      slug: "personal-fixture",
      revision: 2,
      owner_user_id: "10000000-0000-4000-8000-000000000001",
      role: "member",
      is_owner: true,
      can_manage: true,
      is_test: false,
    },
    sessions: [],
    members: [],
    activity: [],
    lab_enabled: false,
    ...overrides,
  };
}

describe("historical conflict recovery", () => {
  it("stays hidden without a historical conflict", () => {
    const html = renderToString(
      <AccountConflictRecovery initial={settings({ email_ownership_state: "verified" })} />,
    );
    expect(html).not.toContain("这个邮箱关联了两个历史账户");
  });

  it("explains the canonical choice before any proof or transfer", () => {
    const html = renderToString(<AccountConflictRecovery initial={settings()} />);
    expect(html).toContain("这个邮箱关联了两个历史账户");
    expect(html).toContain("它们的数据各自独立，不会自动合并");
    expect(html).toContain("你现在登录的这个账户");
    expect(html).toContain("只有在它完全为空时才会转移过来");
    expect(html).toContain("开始核对");
  });

  it("requires both identities before any inventory and supports provider-only accounts", async () => {
    // Interactive: the proof step is reachable and offers provider-only
    // verification instead of a mandatory password.
    const mount = document.createElement("div");
    document.body.append(mount);
    const root = createRoot(mount);
    await act(async () => {
      root.render(<AccountConflictRecovery initial={settings()} />);
    });
    const start = mount.querySelector("button");
    expect(start?.textContent).toContain("开始核对");
    await act(async () => {
      start?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const html = mount.innerHTML;
    expect(html).toContain("验证两个账户的身份");
    expect(html).toContain("另一个账户的用户名或邮箱");
    expect(html).toContain("用已绑定的登录方式验证当前身份");
    await act(async () => root.unmount());
    mount.remove();
  });

  it("submits the provider-only form with blank password fields and the exact ref", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const root = createRoot(mount);
    const recovery = {
      operationRef: "10000000-0000-4000-8000-000000000001",
      roles: {
        current: { provider: "google", expiresAt: "2030-01-01T00:00:00.000Z" },
        duplicate: { provider: "google", expiresAt: "2030-01-01T00:00:00.000Z" },
      },
    };
    await act(async () => {
      root.render(
        <AccountConflictRecovery initial={settings()} recovery={recovery} />,
      );
    });
    const start = mount.querySelector("button");
    await act(async () => {
      start?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    // Provider-only recovery: the password fields are absent and the form
    // still submits with blank passwords and the immutable rendered ref.
    expect(mount.querySelector('input[name="duplicatePassword"]')).toBeNull();
    expect(mount.querySelector('input[name="currentPassword"]')).toBeNull();
    const form = mount.querySelector("form");
    expect(form).not.toBeNull();
    const formData = new FormData(form as HTMLFormElement);
    expect(formData.get("operationRef")).toBe(recovery.operationRef);
    expect(formData.get("duplicatePassword")).toBeNull();
    conflictActions.prepareConflictRecovery.mockResolvedValue({
      record: {
        contract_version: "2026-08-24.10",
        id: "90000000-0000-4000-8000-000000000009",
        kind: "empty_duplicate_transfer",
        state: "prepared",
        frozen_revision: 4,
        inventory: { account_tables: [], problems: [] },
        expires_at: "2030-01-01T00:00:00.000Z",
        created_at: "2026-09-25T00:00:00.000Z",
      },
    });
    await act(async () => {
      (form as HTMLFormElement).dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(conflictActions.prepareConflictRecovery).toHaveBeenCalled();
    const submitted = conflictActions.prepareConflictRecovery.mock.calls.at(-1)![1] as FormData;
    expect(submitted.get("operationRef")).toBe(recovery.operationRef);
    expect(submitted.get("duplicatePassword")).toBeNull();
    await act(async () => root.unmount());
    mount.remove();
  });

  it("shows data categories and counts only in the post-proof preview, never raw records", () => {
    const record: ReconciliationRecord = {
      contract_version: CONTRACT_VERSION,
      id: "30000000-0000-4000-8000-000000000003",
      kind: "review_required",
      state: "prepared",
      frozen_revision: 4,
      inventory: {
        account_tables: [
          { table: "subjects", rows: 2, unexpected_rows: 0, classification: "product" },
          { table: "account_access_events", rows: 1, unexpected_rows: 0, classification: "identity" },
        ],
        problems: ["product_rows:subjects:2"],
      },
      expires_at: "2030-01-01T00:00:00.000Z",
      created_at: "2026-09-25T00:00:00.000Z",
    };
    // The preview carries category totals only: counts, never raw records.
    const summary = inventorySummary(record);
    expect(summary).toEqual({
      productRows: 2,
      identityRows: 1,
      problems: ["product_rows:subjects:2"],
      entirelyEmpty: false,
    });
    expect(JSON.stringify(summary)).not.toContain("subject name");
    // Before dual proof the rendered page shows no counts at all.
    const html = renderToString(<AccountConflictRecovery initial={settings()} />);
    expect(html).not.toContain("产品数据");
    expect(html).not.toContain("登录与审计记录");
  });

  it("keeps a non-empty duplicate in the protected review-required state", () => {
    const record: ReconciliationRecord = {
      contract_version: CONTRACT_VERSION,
      id: "30000000-0000-4000-8000-000000000004",
      kind: "review_required",
      state: "prepared",
      frozen_revision: 4,
      inventory: { account_tables: [], problems: ["lab_workspace_history"] },
      expires_at: "2030-01-01T00:00:00.000Z",
      created_at: "2026-09-25T00:00:00.000Z",
    };
    expect(inventorySummary(record).entirelyEmpty).toBe(false);
  });
});
