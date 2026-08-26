import { describe, expect, it } from "vitest";

import type { KnowledgeSnapshot } from "@talent-signal/contracts";
import { knowledgeSnapshotWikiView } from "@/components/relationship-workspace/relationship-wiki-panel";

function snapshot(status: KnowledgeSnapshot["status"]): KnowledgeSnapshot {
  const dependency = (id: string) => ({
    id,
    type: "evidence_fragment" as const,
    inclusion_reason: "The reviewed source supports this block.",
    authorization_scope: "Current authorized relationship scope.",
  });
  return {
    id: "10000000-0000-4000-8000-000000000001",
    status,
    blocks: [
      {
        id: "10000000-0000-4000-8000-000000000002",
        block_key: "identity.current",
        type: "identity_context",
        status: "confirmed",
        content: { headline: "Leila Hartmann", items: [] },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000001"),
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        block_key: "fact.availability",
        type: "current_state",
        status: "confirmed",
        content: { headline: "Availability: Tuesday", items: [] },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000001"),
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        block_key: "conflict.decision-time",
        type: "conflict",
        status: "contested",
        content: { headline: "Decision timing conflicts", items: [] },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000002"),
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000005",
        block_key: "next-action.current",
        type: "next_action",
        status: "proposed",
        content: {
          headline: "Clarify the decision date",
          summary: "Ask for the exact date before relying on it.",
          items: ["No external action is authorized."],
        },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000003"),
        ],
      },
    ],
  } as KnowledgeSnapshot;
}

describe("relationship Wiki projection", () => {
  it("keeps confirmed facts, contested review, and a proposed action distinct", () => {
    const view = knowledgeSnapshotWikiView(snapshot("published"));

    expect(view?.blocks.map((block) => block.kind)).toEqual([
      "person_brief",
      "fact_review",
      "action_proposal",
    ]);
    expect(view?.blocks[0]).toMatchObject({
      body: "Availability: Tuesday",
      status: "needs_review",
      title: "Leila Hartmann",
    });
    expect(view?.blocks[0].citationDependencyIds).toEqual([
      "20000000-0000-4000-8000-000000000001",
    ]);
    expect(view?.blocks[1].title).toContain("conflicting evidence");
    expect(view?.blocks[2]).toMatchObject({
      status: "proposed",
      title: "Proposed next move",
    });
  });

  it("does not present an unpublished compilation as current Wiki state", () => {
    expect(knowledgeSnapshotWikiView(snapshot("draft"))).toBeNull();
    expect(knowledgeSnapshotWikiView(null)).toBeNull();
  });
});
