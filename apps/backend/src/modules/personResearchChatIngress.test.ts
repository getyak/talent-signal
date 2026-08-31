import { describe, expect, it, vi } from "vitest";

import type { PersonResearchServiceResponse } from "@talent-signal/agent";

import type { PersonResearchAgentProviding } from "./personResearchAgentClient.js";
import {
  personResearchRunID,
  runPersonResearchChatIngress,
} from "./personResearchChatIngress.js";

const runID = "11111111-1111-4111-8111-111111111111";

function noActionResponse(): PersonResearchServiceResponse {
  return {
    contract_version: "person-research-service.v1",
    run_id: runID,
    receipt: {
      run_id: runID,
      status: "no_action",
      reason_code: "NO_VISIBLE_IDENTITY_CLUE",
      artifact_id: null,
      no_action_id: "22222222-2222-4222-8222-222222222222",
      candidate_fingerprint: "a".repeat(64),
      external_effects: [],
      permission_denials: [],
      provider_session_id: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
        estimated_usd: 0,
        turns: 1,
        tool_calls: 0,
        duration_ms: 1,
      },
      completed_at: "2026-08-31T00:00:00.000Z",
    },
    result: {
      kind: "no_action",
      reason_code: "NO_VISIBLE_IDENTITY_CLUE",
      reason: "The image has no visible identity clue.",
    },
  };
}

describe("Relationship Ask screenshot person-research ingress", () => {
  it("derives one stable UUID Run identity from the account-scoped idempotency key", () => {
    const first = personResearchRunID("account-1", "message-1");
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(personResearchRunID("account-1", "message-1")).toBe(first);
    expect(personResearchRunID("account-2", "message-1")).not.toBe(first);
    expect(personResearchRunID("account-1", "message-2")).not.toBe(first);
  });

  it("automatically invokes the Agent for one image without a platform or candidate choice", async () => {
    const research = vi.fn(async () => noActionResponse());
    const provider: PersonResearchAgentProviding = { research };
    const bytes = Uint8Array.from([137, 80, 78, 71]);

    const result = await runPersonResearchChatIngress({
      provider,
      media: [{ id: "media-1", media_type: "image/png" }],
      loadMedia: async () => bytes,
      runID,
      objective: "Who is shown by the visible profile clues?",
    });

    expect(research).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledWith({
      runID,
      objective: "Who is shown by the visible profile clues?",
      image: { mediaType: "image/png", data: bytes },
    });
    expect(result).toMatchObject({
      status: "no_action",
      block: { kind: "person_research", requires_user_decision: false },
    });
  });

  it("does not call the Agent for multiple or unsupported attachments", async () => {
    const research = vi.fn(async () => noActionResponse());
    const result = await runPersonResearchChatIngress({
      provider: { research },
      media: [
        { id: "media-1", media_type: "image/png" },
        { id: "media-2", media_type: "image/jpeg" },
      ],
      loadMedia: async () => Uint8Array.from([1]),
      runID,
      objective: "Synthetic fixture",
    });

    expect(research).not.toHaveBeenCalled();
    expect(result.status).toBe("unsupported_media");
    expect(result.block?.body).toContain("No identity was researched");
  });

  it("returns visible fail-closed recovery when the Agent cannot complete", async () => {
    const result = await runPersonResearchChatIngress({
      provider: { research: async () => { throw new Error("socket unavailable"); } },
      media: [{ id: "media-1", media_type: "image/webp" }],
      loadMedia: async () => Uint8Array.from([1]),
      runID,
      objective: "Synthetic fixture",
    });

    expect(result).toMatchObject({
      status: "failed",
      block: { kind: "failure_recovery", requires_user_decision: false },
    });
    expect(result.block?.body).toContain("no identity was confirmed");
  });
});
