// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { applyTheme, subscribeTheme, themeSnapshot } from "./theme-preference";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); delete document.documentElement.dataset.theme; });
it("updates the active view when another settings window changes the theme", () => {
  const changed = vi.fn(); const stop = subscribeTheme(changed);
  window.dispatchEvent(new StorageEvent("storage", { key: "talent-signal-theme", newValue: "dark" }));
  expect(themeSnapshot()).toBe("dark"); expect(changed).toHaveBeenCalledOnce();
  window.dispatchEvent(new StorageEvent("storage", { key: "foreign", newValue: "light" }));
  expect(themeSnapshot()).toBe("dark");
  stop();
});
it("still applies a theme when local persistence fails", () => {
  vi.stubGlobal("localStorage", { setItem() { throw new Error("disabled"); } });
  applyTheme("dark"); expect(themeSnapshot()).toBe("dark");
});
it("catches a change from another window before hydration subscribes", () => {
  document.documentElement.dataset.theme = "light";
  localStorage.setItem("talent-signal-theme", "dark");
  const stop = subscribeTheme(() => {});
  expect(themeSnapshot()).toBe("dark");
  stop();
});
