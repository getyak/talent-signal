export const THEME_EVENT = "talent-signal:theme-change";
const THEME_KEY = "talent-signal-theme";
export type WorkspaceTheme = "light" | "dark";
export function themeSnapshot(): WorkspaceTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function subscribeTheme(onChange: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    if (event.newValue === "light" || event.newValue === "dark") document.documentElement.dataset.theme = event.newValue;
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", sync);
  // A second window can change the preference between first paint and hydration.
  try {
    const current = window.localStorage.getItem(THEME_KEY);
    if (current === "light" || current === "dark") document.documentElement.dataset.theme = current;
  } catch { /* Keep the current appearance when storage is unavailable. */ }
  return () => { window.removeEventListener(THEME_EVENT, onChange); window.removeEventListener("storage", sync); };
}
export function applyTheme(nextTheme: WorkspaceTheme) {
  document.documentElement.dataset.theme = nextTheme;
  try { window.localStorage.setItem(THEME_KEY, nextTheme); } catch { /* The current view remains usable without persistence. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}
