import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(import.meta.dirname, "../app/globals.css"),
  "utf8",
);

describe("boundary workspace accessibility contract", () => {
  it("keeps every fixture case scrollable above the sidebar footer", () => {
    expect(styles).toMatch(
      /\.review-sidebar nav \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/,
    );
    expect(styles).toMatch(
      /\.review-sidebar__foot \{[\s\S]*?flex: 0 0 auto;/,
    );
  });
});
