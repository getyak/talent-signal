import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRelationshipResourceList } from "@/components/relationship-workspace/relationship-resource-composer";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("relationship resource list read ownership", () => {
  it("shares one in-flight initial read for the same relationship", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ resources: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const first = loadRelationshipResourceList("person-a", "context-a");
    const second = loadRelationshipResourceList("person-a", "context-a");

    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local-integration/resources?person_id=person-a&relationship_context_id=context-a",
      { cache: "no-store" },
    );
  });

  it("does not retain a completed response as relationship truth", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ resources: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await loadRelationshipResourceList("person-b", "context-b");
    await loadRelationshipResourceList("person-b", "context-b");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets a mutation read bypass an older in-flight projection", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ resources: [] }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await Promise.all([
      loadRelationshipResourceList("person-c", "context-c"),
      loadRelationshipResourceList("person-c", "context-c", {
        fresh: true,
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
