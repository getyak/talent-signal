import { describe, expect, it } from "vitest";

import {
  adjudicateAnnotationProposals,
  humanGoldToCriterionAdjudication,
  importAnnotationProposals,
} from "./importAnnotations.js";

describe("annotation import", () => {
  it("keeps imported labels as unreviewed proposals and preserves conflicts", () => {
    const common = {
      scenarioId: "TS-TRJ-001",
      attemptId: "attempt-1",
      criterionId: "quality.clarity",
      rubricId: "soft-quality",
      rubricVersion: "1",
      evidenceLocators: ["trace:1"],
    };
    const result = importAnnotationProposals({
      annotations: [
        { ...common, annotationId: "a1", reviewerRef: "reviewer:1", label: "accept" },
        { ...common, annotationId: "a2", reviewerRef: "reviewer:2", label: "reject" },
      ],
      importedAt: "2026-09-01T00:00:00.000Z",
      expectedRubricVersion: "1",
    });
    expect(result.proposals.every((item) => item.adjudication === "unreviewed")).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.labels).toEqual(["accept", "reject"]);
  });

  it("rejects an annotation without evidence", () => {
    expect(() =>
      importAnnotationProposals({
        annotations: [
          {
            annotationId: "a1",
            scenarioId: "TS-TRJ-001",
            attemptId: "attempt-1",
            criterionId: "quality.clarity",
            rubricId: "soft-quality",
            rubricVersion: "1",
            reviewerRef: "reviewer:1",
            label: "accept",
            evidenceLocators: [],
          },
        ],
        importedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow(/evidence locator/);
  });

  it("keeps a conflict unresolved until an explicit adjudicator addresses every label", () => {
    const common = {
      scenarioId: "TS-TRJ-001",
      attemptId: "attempt-1",
      criterionId: "quality.clarity",
      rubricId: "model-soft-quality",
      rubricVersion: "1",
      evidenceLocators: ["trace:1"],
    };
    const batch = importAnnotationProposals({
      annotations: [
        { ...common, annotationId: "a1", reviewerRef: "reviewer:1", label: "accept" },
        { ...common, annotationId: "a2", reviewerRef: "reviewer:2", label: "reject" },
      ],
      importedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(() =>
      adjudicateAnnotationProposals({
        batch,
        decisions: [
          {
            decisionId: "d1",
            scenarioId: common.scenarioId,
            attemptId: common.attemptId,
            criterionId: common.criterionId,
            proposalIds: ["annotation-proposal:a1"],
            adjudicatorRef: "adjudicator:1",
            outcome: "confirmed",
            selectedLabel: "accept",
            evidenceLocators: ["trace:1"],
            rationale: "The exact output evidence supports accept.",
            decidedAt: "2026-09-01T01:00:00.000Z",
          },
        ],
      }),
    ).toThrow(/every conflicting label/);

    const result = adjudicateAnnotationProposals({
      batch,
      decisions: [
        {
          decisionId: "d2",
          scenarioId: common.scenarioId,
          attemptId: common.attemptId,
          criterionId: common.criterionId,
          proposalIds: ["annotation-proposal:a1", "annotation-proposal:a2"],
          adjudicatorRef: "adjudicator:1",
          outcome: "confirmed",
          selectedLabel: "accept_with_edits",
          evidenceLocators: ["trace:1", "review:adjudication"],
          rationale: "Both labels were considered; a bounded edit resolves the disagreement.",
          decidedAt: "2026-09-01T01:00:00.000Z",
        },
      ],
    });
    expect(result.sourceConflicts).toHaveLength(1);
    expect(result.unresolvedConflictCount).toBe(0);
    expect(result.goldRecords[0]?.label).toBe("accept_with_edits");
    expect(result.goldRecords[0]?.adjudicatorRef).toBe("adjudicator:1");
    expect(humanGoldToCriterionAdjudication(result.goldRecords[0]!)).toEqual({
      criterionId: common.criterionId,
      status: "human_gold",
      evidence: [{ artifactId: "trace:1" }, { artifactId: "review:adjudication" }],
      reviewerId: "adjudicator:1",
      decisionId: "d2",
      decidedAt: "2026-09-01T01:00:00.000Z",
    });
    expect(() =>
      humanGoldToCriterionAdjudication({
        ...result.goldRecords[0]!,
        adjudicatorRef: "adjudicator:tampered",
      }),
    ).toThrow(/content digest mismatch/);
  });
});
