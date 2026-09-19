import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CONTACT_RESEARCH_CONTRACT,
  ContactResearchToolRequestSchema,
  ContactResearchToolResponseSchema,
  type ContactPublicSource,
} from "@talent-signal/agent";
import { assertContactResearchResponseMatchesRequest } from "./contactResearchClient.js";

function source(provider: "exa" | "tikhub", channel: "web" | "reddit", url: string): ContactPublicSource {
  return {
    source_id: createHash("sha256").update(`${provider}:${url}`).digest("hex"),
    url, title: "Example", text: "Discovery text", channel, provider_id: provider,
    provider_request_id: "fixture", content_hash: "a".repeat(64),
    retrieved_at: "2026-09-19T00:00:00.000Z", stage: provider === "exa" ? "discovered" : "profile_observation",
  };
}

describe("contact research response readback", () => {
  const social = source("tikhub", "reddit", "https://www.reddit.com/user/example");
  const web = source("exa", "web", "https://example.com/profile");
  const request = ContactResearchToolRequestSchema.parse({
    contract_version: CONTACT_RESEARCH_CONTRACT, task_id: randomUUID(), call_id: randomUUID(),
    anchors: ["Example"], input: { operation: "fetch", sources: [social, web] },
  });
  const response = ContactResearchToolResponseSchema.parse({
    contract_version: CONTACT_RESEARCH_CONTRACT, task_id: request.task_id, call_id: request.call_id,
    sources: [{ ...web, text: "Fetched body", content_hash: "b".repeat(64), stage: "fetched" }], channels: [],
    fetch_outcomes: [
      { source_id: social.source_id, channel: social.channel, provider: social.provider_id,
        status: "unsupported", error_code: "UNSUPPORTED" },
      { source_id: web.source_id, channel: web.channel, provider: web.provider_id, status: "ok", error_code: null },
    ], external_effects: [],
  });

  it("accepts exact ordered outcomes and the matching successful fetched source", () => {
    expect(() => assertContactResearchResponseMatchesRequest(request, response)).not.toThrow();
  });

  it("rejects missing, reordered, duplicated or substituted fetch readback", () => {
    const malformed = [
      { ...response, fetch_outcomes: response.fetch_outcomes.slice(1) },
      { ...response, fetch_outcomes: [...response.fetch_outcomes].reverse() },
      { ...response, fetch_outcomes: [response.fetch_outcomes[0]!, response.fetch_outcomes[0]!] },
      { ...response, sources: [] },
      { ...response, sources: [{ ...response.sources[0]!, url: "https://example.com/substituted" }] },
      { ...response, sources: [...response.sources, response.sources[0]!] },
    ];
    for (const item of malformed) {
      expect(() => assertContactResearchResponseMatchesRequest(request, item)).toThrow("CONTACT_RESEARCH_READBACK_MISMATCH");
    }
  });

  it("rejects fetch outcomes on a non-fetch response", () => {
    const search = ContactResearchToolRequestSchema.parse({
      contract_version: CONTACT_RESEARCH_CONTRACT, task_id: request.task_id, call_id: request.call_id,
      anchors: ["Example"], input: { operation: "search", channels: ["web"], query: "Example", maximum_results_per_channel: 1 },
    });
    expect(() => assertContactResearchResponseMatchesRequest(search, response)).toThrow("CONTACT_RESEARCH_READBACK_MISMATCH");
  });
});
