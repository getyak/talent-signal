// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DesktopSettingsLink, DesktopUpdateButton, desktopVersion } from "./desktop-chrome";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  delete window.talentSignalDesktop;
  document.body.innerHTML = "";
});

describe("native desktop chrome", () => {
  it("stays absent in ordinary browsers and appears only for a supported host snapshot", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(createElement("div", null,
      createElement(DesktopUpdateButton), createElement(DesktopSettingsLink, { onClick() {} }))));
    expect(host.textContent).toBe("");
    await act(async () => {
      window.talentSignalDesktop = { protocolVersion: 1, availableVersion: null };
      window.dispatchEvent(new Event("talent-signal-desktop"));
    });
    expect(host.textContent).toContain("连接与调试");
    expect(host.querySelector('[href="talentsignal-desktop://updates"]')).toBeNull();
    await act(async () => {
      window.talentSignalDesktop = { protocolVersion: 1, availableVersion: "0.2.0" };
      window.dispatchEvent(new Event("talent-signal-desktop"));
    });
    const update = host.querySelector('[href="talentsignal-desktop://updates"]');
    expect(update?.getAttribute("aria-label")).toContain("0.2.0");
    expect(update?.textContent).toBe("更新");
    await act(async () => {
      window.talentSignalDesktop = { protocolVersion: 1, availableVersion: null };
      window.dispatchEvent(new Event("talent-signal-desktop"));
    });
    expect(host.querySelector('[href="talentsignal-desktop://updates"]')).toBeNull();
  });

  it("rejects unknown protocols and malformed display values", () => {
    expect(desktopVersion({ protocolVersion: 2, availableVersion: "2.0" })).toBeNull();
    expect(desktopVersion({ protocolVersion: 1, availableVersion: "<script>" })).toBeNull();
    expect(desktopVersion({ protocolVersion: 1, availableVersion: "a".repeat(41) })).toBeNull();
    expect(desktopVersion({ protocolVersion: 1, availableVersion: "0.2.0 (12)" })).toBe("0.2.0 (12)");
  });

  it("names one-click restart, prevents repeat clicks during progress and exposes failure recovery", async () => {
    const host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(createElement(DesktopUpdateButton)));
    async function show(phase: "available" | "downloading" | "installing" | "failed" | "idle", progress: number | null = null) {
      await act(async () => {
        window.talentSignalDesktop = { protocolVersion: 1, availableVersion: "0.2.0 (12)", phase, progress, offerID: "b75e9546-2b27-4ee6-bdb2-bcb11f882652" };
        window.dispatchEvent(new Event("talent-signal-desktop"));
      });
    }
    await show("available");
    expect(host.querySelector("a")?.textContent).toBe("更新并重启");
    expect(host.querySelector("a")?.getAttribute("href")).toContain("install-update?offer=b75e9546");
    expect(host.querySelector("a")?.getAttribute("aria-label")).toContain("0.2.0 (12) 并重启");
    await show("downloading", 41);
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-label")).toContain("41%");
    await show("installing");
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toBe("更新中");
    await show("failed");
    expect(host.querySelector("a")?.getAttribute("aria-label")).toContain("重新检查");
    await show("idle");
    expect(host.textContent).toBe("");
  });
});
