import { describe, expect, it } from "vitest";

import { summarizeModelJudgeCalibration, type CalibrationDecisionV1 } from "./calibration.js";
import { runInformationalModelReview } from "./modelReviewer.js";

function calibratedDecisions(): CalibrationDecisionV1[] {
  const base = Array.from({ length: 60 }, (_, index): CalibrationDecisionV1 => {
    const humanLabel = index % 5 === 0 ? "fail" : "pass";
    return {
      decisionId: `decision-${index}`,
      scenarioId: `TS-QUALITY-${index}`,
      criterionId: `quality-${index}`,
      riskTier: "p2_quality",
      humanLabel,
      modelLabel: humanLabel,
      adjudicationStatus: "adjudicated",
      humanGoldRef: `human-gold:${index}`,
      adjudicationDecisionId: `gold-decision:${index}`,
      adjudicatorRef: "adjudicator:model-review-owner",
      evidenceLocators: [`evidence:calibration:${index}`],
      ...(index < 10 ? { orderPairId: `order-${index}` } : {}),
      order: index < 10 ? "original" : "not_pairwise",
      ...(index >= 10 && index < 20 ? { repeatPairId: `repeat-${index}` } : {}),
      repeat: index >= 10 && index < 20 ? "original" : "not_repeat",
    };
  });
  return [
    ...base,
    ...base.slice(0, 10).map((item, index): CalibrationDecisionV1 => ({
      ...item,
      decisionId: `order-swapped-${index}`,
      order: "swapped",
    })),
    ...base.slice(10, 20).map((item, index): CalibrationDecisionV1 => ({
      ...item,
      decisionId: `repeat-run-${index}`,
      repeat: "repeat",
    })),
  ];
}

const request = {
  schemaVersion: "atomic-model-review-request.v1" as const,
  reviewId: "review-1",
  scenarioId: "TS-ACT-107",
  attemptId: "attempt-1",
  criterionId: "quality.clarity",
  rubricId: "model-soft-quality",
  rubricVersion: "1",
  riskTier: "p2_quality" as const,
  dataClass: "synthetic_shareable" as const,
  blindedInput: { task: "Assess one bounded output." },
  observedOutput: { summary: "No material change; no action proposed." },
};

describe("informational model reviewer", () => {
  it("runs only after calibration and never gains gate or P0 authority", async () => {
    const result = await runInformationalModelReview({
      request,
      calibration: summarizeModelJudgeCalibration(calibratedDecisions()),
      client: {
        async review() {
          return {
            label: "pass",
            reasonCode: "ATOMIC_CRITERION_MATCH",
            evidenceLocators: ["output:/summary"],
          } as const;
        },
      },
    });
    expect(result.status).toBe("pass");
    expect(result.gateAuthority).toBe(false);
    expect(result.p0Authority).toBe(false);
  });

  it("keeps missing credentials and oracle leakage truthful", async () => {
    const calibration = summarizeModelJudgeCalibration(calibratedDecisions());
    await expect(runInformationalModelReview({ request, calibration })).resolves.toMatchObject({
      status: "not_run",
      reasonCode: "NOT_RUN_MISSING_MODEL_REVIEW_CREDENTIALS",
    });
    await expect(
      runInformationalModelReview({
        request: { ...request, blindedInput: { oracle: "secret expected answer" } },
        calibration,
      }),
    ).rejects.toThrow(/prohibited key/);
  });
});
