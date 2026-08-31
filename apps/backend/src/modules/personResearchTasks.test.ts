import { createHash } from "node:crypto";

import {
  PERSON_RESEARCH_SERVICE_CONTRACT_VERSION,
  type PersonResearchServiceResponse,
} from "@talent-signal/agent";
import type { PersonResearchTaskRequest } from "@talent-signal/contracts";
import { describe, expect, it, vi } from "vitest";

import type { PersonResearchAgentProviding } from "./personResearchAgentClient.js";
import { personResearchRunID } from "./personResearchChatIngress.js";
import { executePersonResearchTask } from "./personResearchTasks.js";

const accountID = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "ios:person-research:fixture";
const bytes = Buffer.from("synthetic screenshot bytes");

function request(
  override: Partial<PersonResearchTaskRequest["image"]> = {},
): PersonResearchTaskRequest {
  return {
    idempotency_key: idempotencyKey,
    objective: "Find possible public profiles from visible screenshot clues.",
    image: {
      media_type: "image/png",
      byte_size: bytes.byteLength,
      content_hash: createHash("sha256").update(bytes).digest("hex"),
      data_base64: bytes.toString("base64"),
      ...override,
    },
  };
}

function noActionResponse(runID: string): PersonResearchServiceResponse {
  return {
    contract_version: PERSON_RESEARCH_SERVICE_CONTRACT_VERSION,
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
      reason: "No usable visible identity clue was present.",
    },
  };
}

describe("unbound screenshot person-research tasks", () => {
  it("sends one in-memory image directly to the Agent without person, relationship, platform, or candidate input", async () => {
    const expectedRunID = personResearchRunID(accountID, idempotencyKey);
    const research = vi.fn(async () => noActionResponse(expectedRunID));
    const provider: PersonResearchAgentProviding = { research };

    const response = await executePersonResearchTask({
      accountID,
      request: request(),
      provider,
      createdAt: new Date("2026-08-31T00:00:00.000Z"),
    });

    expect(research).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledWith({
      runID: expectedRunID,
      objective: "Find possible public profiles from visible screenshot clues.",
      image: { mediaType: "image/png", data: bytes },
    });
    expect(response).toMatchObject({
      task_id: expectedRunID,
      disposition: "no_action",
      source_image: {
        byte_size: bytes.byteLength,
        persisted: false,
      },
      external_effects: [],
      blocks: [{
        kind: "person_research",
        citation_dependency_ids: [],
        requires_user_decision: false,
      }],
    });
    expect(JSON.stringify(response)).not.toContain(bytes.toString("base64"));
  });

  it("rejects a declared size or hash mismatch before calling the Agent", async () => {
    const research = vi.fn(async () =>
      noActionResponse(personResearchRunID(accountID, idempotencyKey))
    );
    const failures = [
      request({ byte_size: bytes.byteLength + 1 }),
      request({ content_hash: "b".repeat(64) }),
    ];

    for (const invalid of failures) {
      await expect(executePersonResearchTask({
        accountID,
        request: invalid,
        provider: { research },
      })).rejects.toMatchObject({
        code: "PERSON_RESEARCH_IMAGE_MISMATCH",
        statusCode: 400,
      });
    }
    expect(research).not.toHaveBeenCalled();
  });

  it("returns an inspectable zero-effect recovery block when the local Agent fails", async () => {
    const response = await executePersonResearchTask({
      accountID,
      request: request(),
      provider: {
        research: async () => {
          throw new Error("socket unavailable");
        },
      },
    });

    expect(response).toMatchObject({
      disposition: "unavailable",
      source_image: { persisted: false },
      external_effects: [],
      blocks: [{
        kind: "failure_recovery",
        status: "failed",
        requires_user_decision: false,
      }],
    });
  });
});
