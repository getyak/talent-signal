// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarEditor, AvatarDefaultSettings } from "./avatar-editor";
import { AvatarPreferencesProvider } from "./avatar-preferences-provider";
import { PersonDirectoryAvatar } from "./person-directory-avatar";
import { IdentityAvatar } from "./identity-avatar";
import { createAvatarStore } from "@/lib/avatar-preferences";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (text: string) => Array.from((document.querySelector('[role="dialog"]') ?? document).querySelectorAll("button")).find(b =>
  b.textContent === text || b.getAttribute("aria-label") === text || b.querySelector(":scope > span:last-of-type")?.textContent === text)!;
async function click(text: string) {
  const target = button(text);
  expect(target, text).toBeTruthy();
  await act(async () => {
    target.click();
    if (target.getAttribute("aria-haspopup") === "dialog") await import("./avatar-editor-dialog");
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
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
    const storage = window.localStorage;
    vi.spyOn(window, "localStorage", "get").mockReturnValue({
      getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage),
      clear: storage.clear.bind(storage), key: storage.key.bind(storage),
      get length() { return storage.length; },
      setItem: () => { throw new Error("quota"); },
    });
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

  it("requires latest readback before replacing another tab's saved avatar", async () => {
    await render(); await click("编辑 张伟 的头像"); await click("几何");
    const otherTab = createAvatarStore("account-a", () => localStorage);
    await act(() => {
      otherTab.save("person:one", { style: "glass" });
      window.dispatchEvent(new StorageEvent("storage", { key: otherTab.key }));
    });
    await click("保存头像");
    expect(readback().getAttribute("data-avatar-style")).toBe("glass");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("已在其他位置修改");
    expect(button("保存头像").disabled).toBe(true);
    await click("载入最新设置"); await click("姓名"); await click("保存头像");
    expect(readback().getAttribute("data-avatar-style")).toBe("initials");
  });

  it("discards a decoded upload that finishes after the dialog was closed", async () => {
    let finish!: (bitmap: ImageBitmap) => void;
    const bitmap = { width: 400, height: 400, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; })));
    await render(); await click("编辑 张伟 的头像");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["raster"], "a.png", { type: "image/png" })] });
    await act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await click("取消");
    await act(async () => { finish(bitmap); await Promise.resolve(); });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(readback().textContent).toBe("伟");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("returns focus to the account summary if its menu closes while editing", async () => {
    await act(() => root.render(<AvatarPreferencesProvider scope="account-a">
      <details open><summary tabIndex={0}>账号</summary><AvatarEditor id="self" self label="张伟" /></details>
    </AvatarPreferencesProvider>));
    await click("编辑我的头像");
    expect(document.querySelectorAll('[data-state="open"][data-avatar-editor]')).toHaveLength(2);
    host.querySelector("details")!.open = false;
    await click("取消");
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector("summary")));
  });
});
