"use client";

import { Moon, Sun } from "@phosphor-icons/react";

export function ThemeToggle() {
  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("talent-signal-theme", nextTheme);
  }

  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      onClick={toggleTheme}
      aria-label="切换明暗主题"
      title="切换明暗主题"
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
