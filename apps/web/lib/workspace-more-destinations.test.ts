import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const pathname = vi.hoisted(() => ({ current: "/workspace" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkspaceMoreDestinations } from "@/components/workspace-shell-nav";

function render() {
  return renderToStaticMarkup(createElement(WorkspaceMoreDestinations));
}

describe("supplementary workspace destinations", () => {
  it("keeps the disclosure closed on a primary route", () => {
    pathname.current = "/workspace";
    const html = render();

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("更多");
    expect(html).toContain("hidden");
  });

  it("opens itself and marks the current destination on a supplementary route", () => {
    pathname.current = "/workspace/sessions/example";
    const html = render();

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('href="/workspace/sessions"');
    expect(html).toMatch(
      /href="\/workspace\/sessions"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/workspace\/sessions"/,
    );
  });

  it("keeps every supplementary route reachable from the disclosure", () => {
    pathname.current = "/workspace/today";
    const html = render();

    for (const href of [
      "/workspace/today",
      "/workspace/sessions",
      "/workspace/captures",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
