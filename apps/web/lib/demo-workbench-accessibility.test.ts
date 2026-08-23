import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(import.meta.dirname, "../components/demo-workbench.tsx"),
  "utf8",
);

const output = component.slice(
  component.indexOf('<section\n        className="demo-output"'),
  component.indexOf("</div>\n  );\n}", component.indexOf('className="demo-output"')),
);

describe("demo workbench accessibility contract", () => {
  it("announces concise atomic state instead of replaying the full result", () => {
    expect(component).toContain('role="status"');
    expect(component).toContain('aria-live="polite"');
    expect(component).toContain('aria-atomic="true"');
    expect(component).toContain(
      'setAnnouncement("Analyzing conversation evidence.")',
    );
    expect(component).toContain("Analysis complete.");
    expect(output).not.toContain("aria-live");
  });

  it("moves focus into the edit field and announces review state changes", () => {
    expect(component).toContain(
      "editingInputRef.current?.focus();",
    );
    expect(component).toContain(
      "editingInputRef.current?.select();",
    );
    expect(component).toContain("ref={editingInputRef}");
    expect(component).toContain("edit field ready.");
    expect(component).toContain("returned to review");
    expect(component).toContain("supported ${");
  });
});
