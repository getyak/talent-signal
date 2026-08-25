import { describe, expect, it } from "vitest";

import type { KnowledgeBlock } from "@talent-signal/contracts";

import {
  citationAvailability,
  responseBlocks,
  type ChatCitationRow,
  type ChatManifestRow,
} from "./chat.js";

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

  it("carries an evidence-grounded revisit trigger through no-action answers", () => {
    const identity = block(
      "00000000-0000-4000-8000-000000000021",
      "identity.context",
      "identity_context",
      "confirmed",
      "Jordan Kim",
    );
    const noAction = block(
      "00000000-0000-4000-8000-000000000022",
      "attention.no-action",
      "no_action",
      "confirmed",
      "No supported next action is ready.",
    );
    noAction.content.items = [
      "Revisit when a reviewed source changes the confirmed relationship state.",
    ];

    const response = responseBlocks([identity, noAction]);
    expect(response.find((item) => item.kind === "no_action")?.body).toContain(
      "Revisit when a reviewed source changes the confirmed relationship state.",
    );
  });

  it("does not repeat source material already attached to a response block", () => {
    const dependency = {
      type: "evidence_fragment" as const,
      id: "00000000-0000-4000-8000-000000000090",
      inclusion_reason: "Supports the reviewed availability fact.",
      authorization_scope: "relationship_context",
    };
    const identity = block(
      "00000000-0000-4000-8000-000000000091",
      "identity.context",
      "identity_context",
      "confirmed",
      "Jordan Kim",
    );
    const fact = block(
      "00000000-0000-4000-8000-000000000092",
      "fact.availability",
      "constraint",
      "confirmed",
      "Availability: 2026-09-01, Asia/Shanghai",
    );
    const source = block(
      "00000000-0000-4000-8000-000000000093",
      "resource.conversation.fixture",
      "relationship_history",
      "confirmed",
      "Conversation evidence attached",
    );
    const noAction = block(
      "00000000-0000-4000-8000-000000000094",
      "attention.no-action",
      "no_action",
      "confirmed",
      "No action until the candidate clarifies availability",
    );
    fact.dependencies = [dependency];
    source.dependencies = [dependency];

    const response = responseBlocks([identity, fact, source, noAction]);

    expect(response.some((item) => item.kind === "source_receipt")).toBe(false);
    expect(response[0]?.citation_dependency_ids).toEqual([dependency.id]);
  });

  it("keeps relative timing out of confirmed state until date and timezone are explicit", () => {
    const identity = block(
      "00000000-0000-4000-8000-000000000031",
      "identity.context",
      "identity_context",
      "confirmed",
      "Jordan Kim",
    );
    const relative = block(
      "00000000-0000-4000-8000-000000000032",
      "fact.availability.current",
      "constraint",
      "confirmed",
      "Availability: Next Tuesday",
    );
    const noAction = block(
      "00000000-0000-4000-8000-000000000033",
      "attention.no-action",
      "no_action",
      "confirmed",
      "No supported next action is ready.",
    );

    const response = responseBlocks([identity, relative, noAction]);
    const brief = response.find((item) => item.kind === "person_brief");
    const review = response.find(
      (item) => item.title === "Clarify relative timing before relying on it",
    );
    expect(brief?.body).not.toContain("Next Tuesday");
    expect(brief?.status).toBe("confirmed");
    expect(brief?.requires_user_decision).toBe(false);
    expect(review?.body).toContain("Confirm one explicit calendar date and timezone.");
    expect(review?.requires_user_decision).toBe(true);
  });

  it("retains existing canonical action instead of emitting an unqualified no-action", () => {
    const identity = block(
      "00000000-0000-4000-8000-000000000041",
      "identity.context",
      "identity_context",
      "confirmed",
      "Jordan Kim",
    );
    const noAction = block(
      "00000000-0000-4000-8000-000000000042",
      "attention.no-action",
      "no_action",
      "confirmed",
      "No supported next action is ready.",
    );
    const response = responseBlocks([identity, noAction], {
      pursuit_id: "00000000-0000-4000-8000-000000000044",
      action_id: "00000000-0000-4000-8000-000000000043",
      action_title: "Ask the client for two final-conversation times",
      action_status: "drafted",
      due_at: new Date("2026-08-24T09:00:00.000Z"),
      owner_display_name: "Recruiter",
      pursuit_title: "Chief Product Officer · Meridian Labs",
      gap_title: "Client availability is unresolved",
      gap_close_condition: "The client confirms one time",
    });

    expect(response.some((item) => item.kind === "no_action")).toBe(false);
    const action = response.find((item) => item.kind === "active_action");
    expect(action?.body).toContain("Ask the client for two final-conversation times");
    expect(action?.body).toContain("Due: 2026-08-24 09:00:00 UTC");
    expect(action?.body).toContain("Client availability is unresolved");
    expect(action?.requires_user_decision).toBe(false);
    expect(action?.target_ref).toEqual({
      type: "pursuit_action",
      pursuit_id: "00000000-0000-4000-8000-000000000044",
      action_id: "00000000-0000-4000-8000-000000000043",
    });
  });

  it("fails closed when a citation is not bound, reviewed, confirmed, and inspectable", () => {
    const manifest: ChatManifestRow = {
      id: "00000000-0000-4000-8000-000000000101",
      task_id: "00000000-0000-4000-8000-000000000102",
      subject_id: "00000000-0000-4000-8000-000000000103",
      assignment_id: "00000000-0000-4000-8000-000000000104",
      knowledge_snapshot_id: "00000000-0000-4000-8000-000000000105",
      manifest_status: "active",
      snapshot_status: "published",
      authorization_scope:
        "person:00000000-0000-4000-8000-000000000103:relationship-context:00000000-0000-4000-8000-000000000104",
      created_at: new Date("2026-08-25T00:00:00.000Z"),
    };
    const valid: ChatCitationRow = {
      id: "00000000-0000-4000-8000-000000000106",
      person_id: manifest.subject_id,
      relationship_context_id: manifest.assignment_id,
      inclusion_reason: "Exact reviewed source fragment.",
      resource_id: "00000000-0000-4000-8000-000000000107",
      source_name: "Candidate message",
      observed_at: new Date("2026-08-24T17:33:00.000Z"),
      source_timezone: "Asia/Shanghai",
      capture_version: 1,
      fragment_kind: "message",
      sequence: 0,
      exact_excerpt: "The final conversation works next Tuesday.",
      locator: null,
      attributed_actor: "candidate",
      attribution_status: "confirmed",
      review_status: "reviewed",
      parser_name: "fixture",
      parser_version: "1",
      content_hash: "0".repeat(64),
      fragment_created_at: new Date("2026-08-24T17:34:00.000Z"),
      last_review_id: "00000000-0000-4000-8000-000000000108",
      last_reviewed_at: new Date("2026-08-24T17:35:00.000Z"),
      last_reviewed_by: "Recruiter",
      fragment_status: "active",
      resource_status: "ready",
      capture_status: "active",
      source_access_state: "available",
      authorization_state: "authorized",
      authorization_expires_at: null,
    };

    expect(citationAvailability(manifest, valid).availability).toBe(
      "available",
    );
    const invalid = [
      { ...valid, person_id: "00000000-0000-4000-8000-000000000108" },
      {
        ...valid,
        relationship_context_id:
          "00000000-0000-4000-8000-000000000109",
      },
      { ...valid, review_status: "rejected" as const },
      { ...valid, attribution_status: "proposed" as const },
      { ...valid, attribution_status: "unknown" as const },
      { ...valid, exact_excerpt: null },
      { ...valid, exact_excerpt: "   " },
    ];
    for (const citation of invalid) {
      expect(citationAvailability(manifest, citation).availability).not.toBe(
        "available",
      );
    }
  });

  it("exposes only exact evidence fragments as Chat citations", () => {
    const identity = block(
      "00000000-0000-4000-8000-000000000011",
      "identity.context",
      "identity_context",
      "confirmed",
      "Jordan Kim",
    );
    identity.dependencies = [
      {
        type: "fact_version",
        id: "00000000-0000-4000-8000-000000000012",
        inclusion_reason: "Confirmed identity state.",
        authorization_scope: "person:test",
      },
      {
        type: "evidence_fragment",
        id: "00000000-0000-4000-8000-000000000013",
        inclusion_reason: "Exact reviewed source fragment.",
        authorization_scope: "person:test",
      },
    ];
    const noAction = block(
      "00000000-0000-4000-8000-000000000014",
      "attention.no-action",
      "no_action",
      "confirmed",
      "No action",
    );
    noAction.dependencies = identity.dependencies;

    const response = responseBlocks([identity, noAction]);

    expect(response.flatMap((item) => item.citation_dependency_ids)).toEqual([
      "00000000-0000-4000-8000-000000000013",
      "00000000-0000-4000-8000-000000000013",
    ]);
  });
});
