import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

function read(relativePath: string) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("workspace skip-link landmarks", () => {
  it("keeps the global skip link bound to the stable main target", () => {
    expect(read("app/layout.tsx")).toContain('href="#main-content"');
  });

  it.each([
    "components/integrated-workspace-app.tsx",
    "components/workspace-app.tsx",
    "app/workspace/loading.tsx",
  ])("renders one focusable main target in %s", (relativePath) => {
    const source = read(relativePath);

    expect(source.match(/id="main-content"/g)).toHaveLength(1);
    expect(source).toMatch(
      /<main[\s\S]*?id="main-content"[\s\S]*?tabIndex=\{-1\}[\s\S]*?>/,
    );
  });
});
