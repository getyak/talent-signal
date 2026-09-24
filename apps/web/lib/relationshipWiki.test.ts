import { describe, expect, it } from "vitest";

import type { ChatTaskResponse, KnowledgeSnapshot } from "@talent-signal/contracts";
import {
  relationshipWikiView,
  knowledgeSnapshotMemorySections,
  knowledgeSnapshotWikiView,
} from "@/components/relationship-workspace/relationship-wiki-panel";

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
      {
        id: "10000000-0000-4000-8000-000000000006",
        block_key: "commitment.follow-up",
        type: "commitment",
        status: "confirmed",
        content: {
          headline: "Recruiter promised a written brief",
          items: [],
        },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000004"),
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000007",
        block_key: "relationship-history.intro",
        type: "relationship_history",
        status: "confirmed",
        content: {
          headline: "Introduced by Elena",
          items: [],
        },
        dependencies: [
          dependency("20000000-0000-4000-8000-000000000005"),
        ],
      },
    ],
  } as KnowledgeSnapshot;
}

describe("relationship Wiki projection", () => {
  it.each([
    ["No supported next action is ready.", "现有依据尚不足以提出下一步。"],
    ["Wait until the person supplies the missing date.", "Wait until the person supplies the missing date."],
  ])("localizes only the exact system no-action fallback: %s", (headline, expected) => {
    const current = snapshot("published");
    const next = current.blocks.find(block => block.type === "next_action")!;
    next.type = "no_action";
    next.content.headline = headline;
    const projected = knowledgeSnapshotWikiView(current)?.blocks.find(block => block.kind === "no_action");
    expect(projected?.body).toBe(expected);
    expect(projected?.citationDependencyIds).toEqual(next.dependencies.map(dependency => dependency.id));
  });

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
    expect(view?.blocks[1].title).toContain("冲突证据");
    expect(view?.blocks[2]).toMatchObject({
      status: "proposed",
      title: "拟议下一步",
    });
  });

  it("uses the visible response instead of claiming a brief from an older snapshot", () => {
    const response = { blocks: [], knowledge_snapshot_id: "current" } as unknown as ChatTaskResponse;
    expect(relationshipWikiView(response, snapshot("published"))?.blocks).toEqual([]);
    expect(relationshipWikiView(null, snapshot("published"))?.blocks.some((block) => block.kind === "person_brief")).toBe(true);
    expect(relationshipWikiView(null, snapshot("draft"))).toBeNull();
  });

  it("does not present an unpublished compilation as current Wiki state", () => {
    expect(knowledgeSnapshotWikiView(snapshot("draft"))).toBeNull();
    expect(knowledgeSnapshotWikiView(null)).toBeNull();
  });

  it("keeps valuable memory, unresolved state, and history in separate progressive sections", () => {
    const sections = knowledgeSnapshotMemorySections(snapshot("published"));

    expect(sections.map((section) => section.key)).toEqual([
      "valuable",
      "open",
      "history",
    ]);
    expect(sections[0]?.blocks.map((block) => block.type)).toEqual([
      "commitment",
    ]);
    expect(sections[1]?.blocks.map((block) => block.type)).toEqual([
      "conflict",
    ]);
    expect(sections[2]?.blocks.map((block) => block.type)).toEqual([
      "relationship_history",
    ]);
    expect(knowledgeSnapshotMemorySections(snapshot("draft"))).toEqual([]);
  });
});
