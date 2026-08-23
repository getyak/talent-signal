import { describe, expect, it } from "vitest";

import type { KnowledgeBlock } from "@talent-signal/contracts";

import { responseBlocks } from "./chat.js";

function block(
  id: string,
  blockKey: string,
  type: KnowledgeBlock["type"],
  status: KnowledgeBlock["status"],
  headline: string,
): KnowledgeBlock {
  return {
    id,
    block_key: blockKey,
    type,
    status,
    content: { headline, items: [] },
    valid_from: null,
    valid_until: null,
    freshness_until: null,
    sensitivity: "restricted",
    dependencies: [],
    semantic_hash: "0".repeat(64),
  };
}

describe("chat current-state projection", () => {
  it("keeps superseded facts and source receipts out of the current person brief", () => {
    const response = responseBlocks([
      block(
        "00000000-0000-4000-8000-000000000001",
        "identity.context",
        "identity_context",
        "confirmed",
        "Jordan Kim",
      ),
      block(
        "00000000-0000-4000-8000-000000000002",
        "fact.work_mode.old",
        "constraint",
        "superseded",
        "Work mode constraint: Remote is required.",
      ),
      block(
        "00000000-0000-4000-8000-000000000003",
        "fact.work_mode.current",
        "constraint",
        "confirmed",
        "Work mode constraint: three office days",
      ),
      block(
        "00000000-0000-4000-8000-000000000004",
        "resource.conversation.fixture",
        "relationship_history",
        "confirmed",
        "Conversation evidence attached",
      ),
      block(
        "00000000-0000-4000-8000-000000000005",
        "attention.no-action",
        "no_action",
        "confirmed",
        "No action",
      ),
    ]);

    const brief = response.find((item) => item.kind === "person_brief");
    expect(brief?.body).toBe("Work mode constraint: three office days");
    expect(brief?.body).not.toContain("Remote is required");
    expect(brief?.body).not.toContain("Conversation evidence");
    expect(response.some((item) => item.kind === "source_receipt")).toBe(true);
  });
});
