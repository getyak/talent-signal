import { describe, expect, it } from "vitest";

import {
  availablePersonMergeReversalOperationId,
  personMergeDecisionReady,
} from "@/components/relationship-workspace/person-merge-review";

describe("person merge review boundary", () => {
  const readyDecision = {
    blockerCount: 0,
    hasPreview: true,
    hasSelectedPerson: true,
    reason: "Both pages refer to the same person based on reviewed evidence.",
    reviewed: true,
  };

  it("requires a current preview, selected person, written basis, and explicit review", () => {
    expect(personMergeDecisionReady(readyDecision)).toBe(true);
    expect(
      personMergeDecisionReady({ ...readyDecision, hasPreview: false }),
    ).toBe(false);
    expect(
      personMergeDecisionReady({ ...readyDecision, hasSelectedPerson: false }),
    ).toBe(false);
    expect(
      personMergeDecisionReady({ ...readyDecision, reason: "  " }),
    ).toBe(false);
    expect(
      personMergeDecisionReady({ ...readyDecision, reviewed: false }),
    ).toBe(false);
  });

  it("keeps any canonical blocker authoritative", () => {
    expect(
      personMergeDecisionReady({ ...readyDecision, blockerCount: 1 }),
    ).toBe(false);
  });

  it("uses only an applied result or a currently reversible canonical preview", () => {
    expect(
      availablePersonMergeReversalOperationId({
        result: { operation_id: "merge-applied", status: "applied" },
        reversalPreview: null,
      }),
    ).toBe("merge-applied");
    expect(
      availablePersonMergeReversalOperationId({
        result: null,
        reversalPreview: {
          operation_id: "merge-history",
          reversal_available: true,
        },
      }),
    ).toBe("merge-history");
    expect(
      availablePersonMergeReversalOperationId({
        result: null,
        reversalPreview: {
          operation_id: "merge-stale",
          reversal_available: false,
        },
      }),
    ).toBeNull();
  });
});
