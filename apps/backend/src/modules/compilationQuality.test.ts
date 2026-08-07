import type {
  KnowledgeBlock,
  KnowledgeSnapshot,
} from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import {
  assessCompilationPublication,
  deriveCompilationQuality,
  GOLD_COMPILATION_MINIMUM,
} from "./compilationQuality.js";

const accountId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const contextId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";

function block(
  id: string,
  type: KnowledgeBlock["type"],
  headline: string,
): KnowledgeBlock {
  return {
    id,
    block_key: type.replaceAll("_", "."),
    type,
    status: "confirmed",
    content: {
      headline,
      items: [],
    },
    valid_from: "2026-08-06T10:00:00.000Z",
    valid_until: null,
    freshness_until: null,
    sensitivity: "restricted",
    dependencies: [
      {
        type: "evidence_fragment",
        id: evidenceId,
        inclusion_reason: "Synthetic exact evidence for compilation testing.",
        authorization_scope: "synthetic:vp-product",
      },
    ],
    semantic_hash: "a".repeat(64),
  };
}

function goldSnapshot(): KnowledgeSnapshot {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    account_id: accountId,
    person_id: personId,
    relationship_context_id: contextId,
    source_state_cursor: 12,
    compiler: {
      name: "test-wiki-compiler",
      version: "0.1.0",
      policy_version: "wiki-policy.v1",
    },
    status: "published",
    blocks: [
      block(
        "66666666-6666-4666-8666-666666666666",
        "identity_context",
        "Candidate in the VP Product search.",
      ),
      block(
        "77777777-7777-4777-8777-777777777777",
        "current_dependency",
        "The client must confirm the remote-work policy.",
      ),
      block(
        "88888888-8888-4888-8888-888888888888",
        "next_action",
        "Ask the client for the exact policy before contacting the candidate.",
      ),
    ],
    quality: {
      verdict: "gold",
      gates: {
        identity_binding: "pass",
        provenance: "pass",
        scope_authorization: "pass",
        temporal_integrity: "pass",
        prohibited_inference: "pass",
        deletion_lineage: "pass",
      },
      measures: {
        task_relevance: GOLD_COMPILATION_MINIMUM,
        compression: GOLD_COMPILATION_MINIMUM,
        conflict_visibility: GOLD_COMPILATION_MINIMUM,
        recruiter_reviewability: GOLD_COMPILATION_MINIMUM,
      },
      reasons: ["Synthetic gold fixture passes every deterministic gate."],
    },
    compiled_at: "2026-08-06T10:05:00.000Z",
  };
}

describe("knowledge compilation publication gate", () => {
  it("accepts one identity, one dependency, and one source-linked action", () => {
    expect(assessCompilationPublication(goldSnapshot())).toEqual({
      eligible: true,
      issues: [],
    });
  });

  it("rejects a gold label when a mandatory gate failed", () => {
    const snapshot = goldSnapshot();
    snapshot.quality.gates.provenance = "fail";

    const assessment = assessCompilationPublication(snapshot);
    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContainEqual(
      expect.objectContaining({
        code: "COMPILATION_GATE_FAILED",
      }),
    );
  });

  it("rejects simultaneous action and no-action guidance", () => {
    const snapshot = goldSnapshot();
    snapshot.blocks.push(
      block(
        "99999999-9999-4999-8999-999999999999",
        "no_action",
        "Do nothing.",
      ),
    );

    const assessment = assessCompilationPublication(snapshot);
    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContainEqual(
      expect.objectContaining({
        code: "ATTENTION_DECISION_CARDINALITY",
      }),
    );
  });

  it("rejects stale public research from an active snapshot", () => {
    const snapshot = goldSnapshot();
    const research = block(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "sourced_research",
      "A public profile supports the current employment history.",
    );
    research.freshness_until = "2026-08-06T09:00:00.000Z";
    snapshot.blocks.push(research);

    const assessment = assessCompilationPublication(snapshot);
    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContainEqual(
      expect.objectContaining({
        code: "RESEARCH_BLOCK_STALE",
        blockId: research.id,
      }),
    );
  });
});

describe("observable compilation quality derivation", () => {
  it("derives gold only when observable identity, provenance, scope, and attention checks pass", () => {
    const blocks = [
      block(
        "66666666-6666-4666-8666-666666666666",
        "identity_context",
        "Candidate in the VP Product search.",
      ),
      block(
        "99999999-9999-4999-8999-999999999999",
        "no_action",
        "No supported next action is ready.",
      ),
    ];

    expect(
      deriveCompilationQuality({
        blocks,
        expectedAuthorizationScope: "synthetic:vp-product",
        expectedConfirmedStateCount: 0,
        expectedReviewClaimCount: 0,
        reviewClaimsMissingEvidence: 0,
        identityBound: true,
      }),
    ).toEqual(
      expect.objectContaining({
        verdict: "gold",
        gates: expect.objectContaining({
          provenance: "pass",
          prohibited_inference: "pass",
        }),
      }),
    );
  });

  it("abstains when a review claim is missing from the compiled evidence surface", () => {
    const quality = deriveCompilationQuality({
      blocks: [
        block(
          "66666666-6666-4666-8666-666666666666",
          "identity_context",
          "Candidate in the VP Product search.",
        ),
        block(
          "99999999-9999-4999-8999-999999999999",
          "no_action",
          "No supported next action is ready.",
        ),
      ],
      expectedAuthorizationScope: "synthetic:vp-product",
      expectedConfirmedStateCount: 0,
      expectedReviewClaimCount: 1,
      reviewClaimsMissingEvidence: 1,
      identityBound: true,
    });

    expect(quality.verdict).toBe("abstain");
    expect(quality.gates.provenance).toBe("fail");
    expect(quality.measures.conflict_visibility).toBe(0);
  });

  it("abstains when compiled content includes a prohibited person judgment", () => {
    const identity = block(
      "66666666-6666-4666-8666-666666666666",
      "identity_context",
      "Candidate culture fit is high.",
    );
    const quality = deriveCompilationQuality({
      blocks: [
        identity,
        block(
          "99999999-9999-4999-8999-999999999999",
          "no_action",
          "No supported next action is ready.",
        ),
      ],
      expectedAuthorizationScope: "synthetic:vp-product",
      expectedConfirmedStateCount: 0,
      expectedReviewClaimCount: 0,
      reviewClaimsMissingEvidence: 0,
      identityBound: true,
    });

    expect(quality.verdict).toBe("abstain");
    expect(quality.gates.prohibited_inference).toBe("fail");
  });
});
