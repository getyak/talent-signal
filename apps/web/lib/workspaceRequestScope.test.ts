import { afterEach, describe, expect, it, vi } from "vitest";

import { workspaceSessionFetch } from "../components/workspace-session-request";

afterEach(() => vi.unstubAllGlobals());

describe("rendered workspace request scope", () => {
  function browser() {
    vi.stubGlobal("window", {
      location: { href: "http://localhost:3000/workspace/today", origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", {
      querySelector: () => ({ dataset: { workspaceScope: "rendered-account" } }),
    });
  }

  it("pins API writes to the rendered workspace and preserves request headers", async () => {
    browser();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const original = new Request("http://localhost:3000/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    await workspaceSessionFetch(original, undefined, request);
    const sent = new Headers(request.mock.calls[0][1]?.headers);
    expect(sent.get("X-Talent-Signal-Workspace")).toBe("rendered-account");
    expect(sent.get("Content-Type")).toBe("application/json");
    expect(original.headers.has("X-Talent-Signal-Workspace")).toBe(false);
  });

  it("does not disclose workspace identity to an external origin", async () => {
    browser();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    await workspaceSessionFetch("https://example.com/api/upload", undefined, request);
    expect(new Headers(request.mock.calls[0][1]?.headers).has("X-Talent-Signal-Workspace")).toBe(false);
  });
});
