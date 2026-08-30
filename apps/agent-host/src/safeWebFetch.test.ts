import type { promises as dns } from "node:dns";

import { describe, expect, it, vi } from "vitest";

import {
  AgentSafeWebFetchError,
  fetchDiscoveredPublicPage,
  isBlockedWebAddress,
} from "./safeWebFetch.js";
import type {
  AgentPublicResearchScope,
  AgentWebSearchResult,
} from "@talent-signal/agent";

const scope: AgentPublicResearchScope = {
  runID: "33333333-3333-4333-8333-333333333333",
  objective: "Research Example Company.",
  providerID: "synthetic-search",
  authorization: {
    purpose: "company_market_research",
    subjectKind: "company",
    accessMode: "domain_allowlist",
    allowedDomains: ["example.com"],
    queryAnchors: ["Example Company"],
    maximumSearchCount: 1,
    maximumFetchCount: 1,
  },
};

const result: AgentWebSearchResult = {
  resultID: "a".repeat(64),
  url: "https://example.com/report",
  title: "Public report",
  snippet: "A public report.",
  publishedAt: null,
  providerID: scope.providerID,
};

const publicLookup = (async () => [
  { address: "93.184.216.34", family: 4 as const },
]) as unknown as typeof dns.lookup;

describe("local safe web fetch", () => {
  it("blocks private and reserved network addresses", () => {
    expect(isBlockedWebAddress("127.0.0.1")).toBe(true);
    expect(isBlockedWebAddress("10.0.0.1")).toBe(true);
    expect(isBlockedWebAddress("::1")).toBe(true);
    expect(isBlockedWebAddress("93.184.216.34")).toBe(false);
  });

  it("fetches one discovered page with a content identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          "<html><body><h1>Public report</h1><p>Market expanded.</p></body></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );

    const page = await fetchDiscoveredPublicPage(
      scope,
      result,
      new AbortController().signal,
      { fetcher, lookup: publicLookup },
    );

    expect(page.text).toContain("Market expanded.");
    expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(page.canonicalUrl).toBe(result.url);
  });

  it("rejects a cross-host redirect", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://other.test/private" },
        }),
      );

    await expect(
      fetchDiscoveredPublicPage(
        scope,
        result,
        new AbortController().signal,
        { fetcher, lookup: publicLookup },
      ),
    ).rejects.toMatchObject({
      code: "WEB_FETCH_REDIRECT_OUT_OF_SCOPE",
    } satisfies Partial<AgentSafeWebFetchError>);
  });

  it("classifies DNS and transport failures without treating them as tool input", async () => {
    const failedLookup = (async () => {
      throw new Error("dns offline");
    }) as unknown as typeof dns.lookup;
    await expect(
      fetchDiscoveredPublicPage(
        scope,
        result,
        new AbortController().signal,
        { fetcher: vi.fn<typeof fetch>(), lookup: failedLookup },
      ),
    ).rejects.toMatchObject({ code: "WEB_FETCH_DNS_FAILED" });

    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockRejectedValueOnce(new Error("connection reset"));
    await expect(
      fetchDiscoveredPublicPage(
        scope,
        result,
        new AbortController().signal,
        { fetcher, lookup: publicLookup },
      ),
    ).rejects.toMatchObject({ code: "WEB_FETCH_UNAVAILABLE" });
  });
});
