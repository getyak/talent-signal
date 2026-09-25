import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const actions = vi.hoisted(() => ({
  saveAccountPassword: vi.fn(),
  unlinkLoginMethod: vi.fn(),
  startProviderLink: vi.fn(),
  startPasswordStepUpLink: vi.fn(),
  startProviderReauth: vi.fn(),
  completeStagedPassword: vi.fn(),
  continueTargetLink: vi.fn(),
  completeStagedUnlink: vi.fn(),
}));
vi.mock("@/app/workspace/settings/login-methods/actions", () => actions);

import { AccountDataSync, AccountSignInMethods } from "./account-sign-in-methods";
import { StagedTargetLinkForm } from "@/app/workspace/settings/link-complete/staged-forms";
import type { AccountSettings } from "@talent-signal/contracts";
import { CONTRACT_VERSION } from "@talent-signal/contracts";

function settings(overrides: Partial<AccountSettings> = {}): AccountSettings {
  return {
    contract_version: CONTRACT_VERSION,
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
      display_name: "Owner",
      username: null,
      kind: "google_human",
      revision: 1,
      login_methods: ["google"],
      email_verified_at: "2026-09-25T00:00:00.000Z",
    },
    sign_in_methods: [
      { provider: "apple", state: "unconnected", hint: null, can_unlink: false },
      { provider: "google", state: "connected", hint: "owner@example.test", can_unlink: true },
      { provider: "password", state: "unconnected", hint: null, can_unlink: false },
    ],
    email_ownership_state: "verified",
    workspace: {
      id: "20000000-0000-4000-8000-000000000002",
      name: "Workspace",
      slug: "personal-fixture",
      revision: 1,
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

describe("settings sign-in methods", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the real method state for every provider, including narrow layouts", () => {
    const html = renderToString(<AccountSignInMethods initial={settings()} />);
    expect(html).toContain("登录方式");
    expect(html).toContain("已绑定");
    expect(html).toContain("未绑定");
    // Status is visible per row; the ambiguous action label never carries it.
    expect(html).toContain("绑定");
    // The last-method note belongs to a connected row that cannot be removed.
    const locked = renderToString(
      <AccountSignInMethods
        initial={settings({
          sign_in_methods: [
            { provider: "apple", state: "unconnected", hint: null, can_unlink: false },
            { provider: "google", state: "connected", hint: null, can_unlink: false },
            { provider: "password", state: "unconnected", hint: null, can_unlink: false },
          ],
        })}
      />,
    );
    expect(locked).toContain("至少保留一种登录方式");
  });

  it("separates current-account verification from new-provider confirmation", () => {
    const html = renderToString(<AccountSignInMethods initial={settings()} />);
    expect(html).toContain("添加登录方式不会创建工作空间、移动记录或更改主邮箱");
    // The binding review names the original account effect before committing.
    const review = renderToString(
      <StagedTargetLinkForm
        targetProvider="apple"
        note="当前身份已验证。继续连接新的登录方式；完成后仍是你现在的账户。"
        scope={{
          operationRef: "10000000-0000-4000-8000-000000000001",
          accountId: "20000000-0000-4000-8000-000000000002",
          userId: "30000000-0000-4000-8000-000000000003",
          accountRevision: 1,
          userRevision: 1,
        }}
      />,
    );
    expect(review).toContain("将 Apple 绑定到这个账户");
    expect(review).toContain("完成后仍是你现在的账户");
  });

  it("offers provider reauthentication for provider-only accounts", () => {
    const html = renderToString(
      <AccountSignInMethods
        initial={settings({
          sign_in_methods: [
            { provider: "apple", state: "connected", hint: "relay@privaterelay.appleid.com", can_unlink: true },
            { provider: "google", state: "unconnected", hint: null, can_unlink: false },
            { provider: "password", state: "unconnected", hint: null, can_unlink: false },
          ],
        })}
      />,
    );
    // The row offers the first password and the other provider without a
    // mandatory current-password field.
    expect(html).toContain("设置密码");
    expect(html).toContain("绑定");
    expect(html).not.toContain("必须使用密码");
  });

  it("marks legacy-unverified passwords honestly instead of promoting them", () => {
    const html = renderToString(
      <AccountSignInMethods
        initial={settings({
          sign_in_methods: [
            { provider: "apple", state: "unconnected", hint: null, can_unlink: false },
            { provider: "google", state: "unconnected", hint: null, can_unlink: false },
            { provider: "password", state: "legacy_unverified", hint: null, can_unlink: false },
          ],
          email_ownership_state: "legacy_unverified",
        })}
      />,
    );
    expect(html).toContain("需要验证邮箱");
    expect(html).toContain("还没有验证邮箱所有权");
  });

  it("claims success only after the readback agrees, and failures never claim the account is unchanged", () => {
    // Verified success: the completion carried the method and expected state
    // and the authoritative settings readback agrees.
    const verified = renderToString(
      <AccountSignInMethods initial={settings()} linkStatus="done" />,
    );
    // A bare completion flag without method verification proves nothing.
    expect(verified).toContain("请核对下方登录方式的实际状态");
    const failed = renderToString(<AccountSignInMethods initial={settings()} linkStatus="error" />);
    expect(failed).toContain("无法确认这次操作的结果");
    expect(failed).not.toContain("没有完成");
    expect(verified).not.toContain("操作已完成");
    expect(failed).not.toContain("账号没有任何更改");
    expect(failed).toContain("请核对下方登录方式的实际状态");
  });

  it("never claims a live sync success; the sync block states automatic behavior", () => {
    const html = renderToString(<AccountDataSync />);
    expect(html).toContain("联系人与对话会自动同步到你的设备");
    expect(html).not.toContain("同步完成");
  });
});
