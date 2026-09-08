"use client";

import { Moon, Sun } from "@phosphor-icons/react";

export function ThemeToggle({ label = "切换明暗主题" }: { label?: string }) {
  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem("talent-signal-theme", nextTheme);
    } catch {
      /* Theme still works when persistence is unavailable. */
    }
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle__dark" aria-hidden="true">
        <Moon aria-hidden="true" size={18} weight="regular" />
      </span>
      <span className="theme-toggle__light" aria-hidden="true">
        <Sun aria-hidden="true" size={18} weight="regular" />
      </span>
    </button>
  );
}
