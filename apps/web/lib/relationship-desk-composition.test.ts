import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

/**
 * The embedded relationship desk used to anchor its Agent panel to the
 * viewport (`position: fixed; left: 84px`), so the 236px product sidebar
 * clipped it at 1280px. These guards keep the notebook + right-rail
 * composition: the panel must sit in normal flow inside the page grid, and
 * the content column must not keep a fixed left offset.
 */
describe("embedded relationship desk composition", () => {
  const styles = read("components/relationship-workspace/relationship-desk.module.css");
  const desk = read("components/relationship-workspace-app.tsx");

  it("marks the desk root so the scoped layout rules apply", () => {
    expect(desk).toContain("relationship-desk");
    expect(desk).toContain("deskStyles.desk");
  });

  it("puts the Agent panel in a real grid column instead of the viewport", () => {
    expect(styles).toContain(":global(.context-page) > :global(.context-chat)");
    expect(styles).toContain("grid-column: 2");
    expect(styles).toContain("position: sticky");
    expect(styles).toContain("left: auto");
    expect(styles).toContain("width: auto");
  });

  it("removes the fixed content offset and bounds the notebook column", () => {
    expect(styles).toContain(":global(.context-main)");
    expect(styles).toContain("margin-left: 0");
    expect(styles).toContain("max-width: 1280px");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) 336px");
  });

  it("collapses to one column and moves the panel below the notebook text", () => {
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(styles).toContain("order: 2");
    expect(styles).toContain("order: 1");
  });

  it("scales the person heading to the reference, not a poster", () => {
    expect(styles).toContain("context-contact-header__identity h1");
    expect(styles).toContain("font-size: clamp(1.6rem, 2.4vw, 1.9rem)");
  });

  it("keeps the unscoped start panel in flow above the onboarding column", () => {
    expect(styles).toContain(":global(.context-chat--standalone)");
    expect(styles).toContain("max-width: 760px");
  });
});
