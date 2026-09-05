import { describe, expect, it, vi } from "vitest";
import { ExaProvider, publicExaUrl } from "./exaProvider.js";
import { configuredLocalWebSearchProvider } from "./providerConfig.js";

const signal = () => new AbortController().signal;
const response = (results: object[]) => new Response(JSON.stringify({ requestId: "exa-request", results }));

describe("Exa research", () => {
  it("uses the people index for LinkedIn and filters unrelated profile domains", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([
      { url: "https://www.linkedin.com/in/example/#about", title: "Example Person", highlights: ["Engineer at Example"] },
      { url: "https://linkedin.com.evil.example/in/example", title: "Wrong host" },
      { url: "https://www.linkedin.com/company/example", title: "A company" },
    ]));
    const results = await new ExaProvider({ apiKey: "test-secret", fetcher }).searchProfiles("Example Person engineer", 5, signal());
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ url: "https://www.linkedin.com/in/example/", text: "Engineer at Example", providerID: "exa", providerRequestID: "exa-request" });
    expect(results[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.exa.ai/search");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "Example Person engineer", category: "people", type: "auto", numResults: 5,
      includeDomains: ["linkedin.com"], contents: { highlights: true },
    });
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-secret");
    expect(JSON.stringify(results)).not.toContain("test-secret");
  });

  it("fetches the requested source and refuses a substituted result", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ url: "https://example.com/profile", title: "Profile", text: "Source text" }]))
      .mockResolvedValueOnce(response([{ url: "https://other.example/profile", title: "Other", text: "Unrelated" }]));
    const provider = new ExaProvider({ apiKey: "test-secret", fetcher });
    expect(await provider.fetchContent("https://example.com/profile", signal())).toMatchObject({ text: "Source text" });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ urls: ["https://example.com/profile"], text: { maxCharacters: 16_000 } });
    await expect(provider.fetchContent("https://example.com/profile", signal())).rejects.toMatchObject({ code: "EXA_CONTENT_UNAVAILABLE" });
  });

  it("keeps discovery domain policy when selected in the existing research runtime", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([
      { url: "https://example.com/news", title: "Update", highlights: ["Published announcement"] },
      { url: "https://outside.example/news", title: "Not allowed" },
    ]));
    const provider = new ExaProvider({ apiKey: "test-secret", fetcher });
    const results = await provider.search({
      runID: "33333333-3333-4333-8333-333333333333", objective: "Research Example", providerID: "exa",
      authorization: { purpose: "company_market_research", subjectKind: "company", accessMode: "domain_allowlist",
        allowedDomains: ["example.com"], queryAnchors: ["Example"], maximumSearchCount: 2, maximumFetchCount: 2 },
    }, { query: "Example news", maximumResults: 3, recencyDays: null }, signal());
    expect(results).toHaveLength(1);
    expect(results[0]?.snippet).toBe("Published announcement");
    expect(configuredLocalWebSearchProvider({ TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER: "exa", EXA_API_KEY: "test-secret" }).id).toBe("exa");
  });

  it("rejects private URLs and private-contact searches before dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new ExaProvider({ apiKey: "test-secret", fetcher });
    for (const url of ["https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://host.local/", "https://metadata.internal/", "https://u:p@example.com/", "http://example.com/", "https://example.com:8443/"]) {
      expect(publicExaUrl(url)).toBeNull();
      await expect(provider.fetchContent(url, signal())).rejects.toMatchObject({ code: "EXA_FETCH_URL_INVALID" });
    }
    await expect(provider.searchProfiles("Example Person home address", 5, signal())).rejects.toMatchObject({ code: "EXA_PRIVATE_LOOKUP_PROHIBITED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports provider failure without exposing response content or falling back", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider body", { status: 402 }));
    await expect(new ExaProvider({ apiKey: "test-secret", fetcher }).searchWeb("Example Person", 5, signal()))
      .rejects.toMatchObject({ code: "EXA_CREDIT_UNAVAILABLE", message: "Exa request failed with HTTP 402." });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds streamed responses even without a content length", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_000_001)); controller.close(); } });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(new ExaProvider({ apiKey: "test-secret", fetcher }).searchWeb("Example Person", 5, signal()))
      .rejects.toMatchObject({ code: "EXA_RESPONSE_TOO_LARGE" });
  });
});
