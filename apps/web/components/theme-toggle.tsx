"use client";

import { Moon, Palette, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

const THEME_KEY = "talent-signal-theme";
const THEME_EVENT = "talent-signal:theme-change";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function themeSnapshot(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(nextTheme: "light" | "dark") {
  document.documentElement.dataset.theme = nextTheme;
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    /* Theme still works when persistence is unavailable. */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * One theme control with two honest presentations: a circular icon action for
 * headers, and a menu row that names the current appearance in text.
 */
export function ThemeToggle({
  label = "切换明暗主题",
  showValue = false,
  variant = "icon",
}: {
  label?: string;
  showValue?: boolean;
  variant?: "icon" | "row";
}) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, () => "light");

  function toggleTheme() {
    applyTheme(theme === "light" ? "dark" : "light");
  }

  if (variant === "row") {
    return (
      <button
        aria-label={label}
        className="theme-toggle theme-toggle--row"
        onClick={toggleTheme}
        title={label}
        type="button"
      >
        <Palette aria-hidden="true" size={16} />
        <span>外观</span>
        <span className="theme-toggle__value">
          {showValue ? (theme === "dark" ? "深色" : "浅色") : null}
        </span>
      </button>
    );
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
