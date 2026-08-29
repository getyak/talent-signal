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
      'setAnnouncement("正在分析对话证据。")',
    );
    expect(component).toContain("分析完成。");
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
    expect(component).toContain("编辑字段已就绪。");
    expect(component).toContain("已返回审阅");
    expect(component).toContain("项有依据的变更");
  });
});
