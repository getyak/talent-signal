// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
const mocks = vi.hoisted(() => ({ save: vi.fn(), preview: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/onboarding/actions", () => ({ saveOnboarding: mocks.save, previewOnboarding: mocks.preview }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
import { AccountOnboardingForm } from "./account-onboarding-form";
let root: Root; let host: HTMLDivElement;
const initial = { contract_version: CONTRACT_VERSION, account_id: "a", user_id: "u", display_name: "Synthetic owner", focus: "Original focus", profile_url: "https://example.com/about", status: "pending" as const, revision: 1 };
const scope = { accountId: "a", userId: "u", binding: "session" };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(AccountOnboardingForm, { initial, scope, callbackUrl: "/workspace/sessions", edit: false })));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function button(label: string) { return Array.from(host.querySelectorAll("button")).find(node => node.textContent?.includes(label))!; }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
describe("onboarding recovery and explicit preview", () => {
  it("retries an unknown save with the identical frozen payload", async () => {
    mocks.save.mockResolvedValueOnce({ error: "Unknown result", recovery: "retry" }).mockResolvedValueOnce({ data: { ...initial, status: "completed", revision: 2 } });
    await submit(); const first = mocks.save.mock.calls[0][1];
    expect(host.querySelector("fieldset")?.disabled).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
    await submit();
    expect(mocks.save.mock.calls[1][1]).toEqual(first);
    expect(mocks.replace).toHaveBeenCalledWith("/workspace/sessions");
  });
  it("skip persists the existing optional values and completes the callback", async () => {
    mocks.save.mockResolvedValue({ data: { ...initial, status: "skipped", revision: 2 } });
    await act(async () => button("以后再说").click());
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ status: "skipped", display_name: initial.display_name, focus: initial.focus, profile_url: initial.profile_url });
    expect(mocks.replace).toHaveBeenCalled();
  });
  it("reads only after a click and leaves the draft unchanged until chosen", async () => {
    mocks.preview.mockResolvedValue({ preview: { contract_version: CONTRACT_VERSION, profile_url: initial.profile_url, excerpt: "A public source introduction", retrieved_at: new Date().toISOString() } });
    expect(mocks.preview).not.toHaveBeenCalled();
    await act(async () => button("读取公开简介").click());
    expect(host.textContent).toContain("尚未保存");
    expect(host.querySelector("textarea")?.value).toBe(initial.focus);
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => button("填入介绍").click());
    expect(host.querySelector("textarea")?.value).toBe("A public source introduction");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("stale state offers readback without sending a second mutation", async () => {
    mocks.save.mockResolvedValue({ error: "Changed", recovery: "refresh" });
    await submit(); await submit();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("载入最新资料");
  });
});
