import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/integrated-workspace-app.tsx",
  ),
  "utf8",
);

describe("integration evidence navigation", () => {
  it("reopens and focuses a repeated exact-source target", () => {
    expect(component).toContain("target.scrollIntoView");
    expect(component).toContain("target.focus({ preventScroll: true })");
    expect(component.match(/openExactEvidence\(/g)).toHaveLength(3);
  });
});
