import { describe, expect, it } from "vitest";
import {
  isSettingsSection,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "./settings-sections";

describe("settings section schema", () => {
  it("accepts every rendered section and the account default", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "account",
      "workspace",
      "appearance",
      "connections",
      "advanced",
      "testing",
    ]);
    for (const section of SETTINGS_SECTIONS) {
      expect(isSettingsSection(section.id)).toBe(true);
    }
  });

  it("rejects unknown, empty and missing values without throwing", () => {
    expect(isSettingsSection("billing")).toBe(false);
    expect(isSettingsSection("")).toBe(false);
    expect(isSettingsSection(undefined)).toBe(false);
    expect(isSettingsSection(null)).toBe(false);
  });

  it("is a pure server-safe predicate (no React or client boundary)", () => {
    const section: SettingsSection = "account";
    expect(isSettingsSection(section)).toBe(true);
  });
});
