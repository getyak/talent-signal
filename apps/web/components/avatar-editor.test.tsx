// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarEditor, AvatarDefaultSettings } from "./avatar-editor";
import { AvatarPreferencesProvider } from "./avatar-preferences-provider";
import { PersonDirectoryAvatar } from "./person-directory-avatar";
import { IdentityAvatar } from "./identity-avatar";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from((document.querySelector('[role="dialog"]') ?? document).querySelectorAll("button")).find(b => b.textContent === text || b.getAttribute("aria-label") === text)!;
async function click(text: string) { expect(button(text), text).toBeTruthy(); await act(() => button(text).click()); }
async function render(scope = "account-a") {
  await act(() => root.render(<AvatarPreferencesProvider scope={scope}>
    <AvatarEditor id="one" label="张伟" />
    <div data-testid="readback"><PersonDirectoryAvatar id="one" label="张伟" /></div>
    <AvatarDefaultSettings />
  </AvatarPreferencesProvider>));
}
const readback = () => host.querySelector('[data-testid="readback"] [data-avatar-style]')!;

describe("avatar editing through the rendered controls", () => {
  it("reveals a cached photo that finished loading before hydration attaches handlers", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(128);
    await act(() => root.render(<IdentityAvatar id="one" label="John Smith" url="https://example.test/cached" />));
    expect(host.querySelector("img")?.dataset.loaded).toBe("true");
  });
  it("cancels draft changes, saves to every occurrence, persists after remount, and isolates accounts", async () => {
    await render();
    await click("编辑 张伟 的头像"); await click("柔光"); await click("取消");
    expect(readback().getAttribute("data-avatar-style")).toBe("initials");
    await click("编辑 张伟 的头像"); await click("几何"); await click("保存头像");
    expect(readback().getAttribute("data-avatar-style")).toBe("shapes");
    await render("account-b"); expect(readback().getAttribute("data-avatar-style")).toBe("initials");
    await render("account-a"); expect(readback().getAttribute("data-avatar-style")).toBe("shapes");
    await click("编辑 张伟 的头像"); await click("恢复默认"); await click("保存头像");
    expect(readback().textContent).toBe("伟");
  });

  it("keeps the editor open and old avatar visible when storage rejects a save", async () => {
    await render(); await click("编辑 张伟 的头像"); await click("柔光");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await click("保存头像");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("没有保存成功");
    expect(readback().getAttribute("data-avatar-style")).toBe("initials");
  });

  it("keeps initials while a photo loads, removes a failed photo and accepts a changed source", async () => {
    await act(() => root.render(<IdentityAvatar id="one" label="John Smith" url="https://example.test/a" />));
    expect(host.textContent).toBe("JS");
    expect(host.querySelector("img")?.dataset.loaded).toBe("false");
    await act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull(); expect(host.textContent).toBe("JS");
    await act(() => root.render(<IdentityAvatar id="one" label="John Smith" url="https://example.test/b" />));
    await act(() => host.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(host.querySelector("img")?.dataset.loaded).toBe("true");
  });
});
