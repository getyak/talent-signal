// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarEditor } from "./avatar-editor";
import { AvatarPreferencesProvider } from "./avatar-preferences-provider";
import { PersonDirectoryAvatar } from "./person-directory-avatar";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function render(scope = "personal-a") {
  await act(() => root.render(<AvatarPreferencesProvider scope={scope}>
    <AvatarEditor id="self" self label="示例用户" />
    <div data-readback><PersonDirectoryAvatar id="self" self label="示例用户" /></div>
    <div data-contact><PersonDirectoryAvatar id="person-one" label="张伟" /></div>
  </AvatarPreferencesProvider>));
}
async function click(label: string) {
  const within = document.querySelector('[role="dialog"]') ?? document;
  const button = [...within.querySelectorAll("button")].find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  expect(button, label).toBeTruthy();
  await act(async () => {
    button!.click();
    if (button!.getAttribute("aria-haspopup") === "dialog") await import("./avatar-editor-dialog");
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
function generated(within: ParentNode) {
  const sources = [...within.querySelectorAll('img')].map(img => img.getAttribute('src'));
  expect(sources.length).toBeGreaterThan(0);
  expect(sources.every(src => src?.startsWith('data:image/svg+xml'))).toBe(true);
  return sources;
}
function preview() { return generated(document.querySelector('[role="dialog"] [data-avatar-style]')!); }
function readback() { return generated(host.querySelector('[data-readback]')!); }

describe("personal generated avatar choices", () => {
  it("shuffles a local preview, commits only on save, and restores the same image after reload", async () => {
    await render();
    await click("编辑我的头像"); await click("几何");
    const first = preview();
    await click("换一个");
    const shuffled = preview();
    expect(shuffled).not.toEqual(first);
    expect(host.querySelector('[data-readback]')?.textContent).toBe("户");
    await click("保存头像");
    expect(readback()).toEqual(shuffled);
    expect(host.querySelector('[data-contact]')?.textContent).toBe("伟");
    await click("编辑我的头像"); await click("换一个"); await click("取消");
    expect(readback()).toEqual(shuffled);
    await act(() => root.unmount()); root = createRoot(host);
    await render(); expect(readback()).toEqual(shuffled);
    await render("personal-b"); expect(host.querySelector('[data-readback]')?.textContent).toBe("户");
    await render("personal-a"); expect(readback()).toEqual(shuffled);
    await click("编辑我的头像"); await click("恢复默认"); await click("保存头像");
    expect(host.querySelector('[data-readback]')?.textContent).toBe("户");
  });

  it("keeps the saved image when a generated-avatar save fails", async () => {
    await render(); await click("编辑我的头像"); await click("柔光"); await click("保存头像");
    const saved = readback();
    await click("编辑我的头像"); await click("换一个");
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await click("保存头像");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("没有保存成功");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(readback()).toEqual(saved);
  });
});
