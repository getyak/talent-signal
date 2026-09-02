import { describe, expect, it } from "vitest";

import {
  summarizeModelJudgeCalibration,
  type CalibrationDecisionV1,
} from "./calibration.js";

function decision(index: number): CalibrationDecisionV1 {
  const humanLabel = index % 3 === 0 ? "fail" : "pass";
  return {
    decisionId: `decision-${index}`,
    scenarioId: `TS-TRJ-${String(index).padStart(3, "0")}`,
    criterionId: `quality-${index}`,
    riskTier: index === 0 ? "p0_blocker" : "p2_quality",
    humanLabel,
    modelLabel: index === 1 ? "abstain" : humanLabel,
    adjudicationStatus: "adjudicated",
    humanGoldRef: `human-gold:${index}`,
    adjudicationDecisionId: `gold-decision:${index}`,
    adjudicatorRef: "adjudicator:calibration-owner",
    evidenceLocators: [`evidence:calibration:${index}`],
    order: "not_pairwise",
    repeat: "not_repeat",
  };
}

function wellCalibrated(): CalibrationDecisionV1[] {
  const base = Array.from({ length: 60 }, (_, index): CalibrationDecisionV1 => {
    const humanLabel = index % 5 === 0 ? "fail" : "pass";
    return {
      decisionId: `base-${index}`,
      scenarioId: `TS-QUALITY-${String(index).padStart(3, "0")}`,
      criterionId: `quality-${index}`,
      riskTier: "p2_quality",
      humanLabel,
      modelLabel: humanLabel,
      adjudicationStatus: "adjudicated",
      humanGoldRef: `human-gold:${index}`,
      adjudicationDecisionId: `gold-decision:${index}`,
      adjudicatorRef: "adjudicator:calibration-owner",
      evidenceLocators: [`evidence:calibration:${index}`],
      ...(index < 10 ? { orderPairId: `order-${index}` } : {}),
      order: index < 10 ? "original" : "not_pairwise",
      ...(index >= 10 && index < 20 ? { repeatPairId: `repeat-${index}` } : {}),
      repeat: index >= 10 && index < 20 ? "original" : "not_repeat",
    };
  });
  const orderPairs = base.slice(0, 10).map((item, index): CalibrationDecisionV1 => ({
    ...item,
    decisionId: `order-swapped-${index}`,
    order: "swapped",
  }));
  const repeats = base.slice(10, 20).map((item, index): CalibrationDecisionV1 => ({
    ...item,
    decisionId: `repeat-run-${index}`,
    repeat: "repeat",
  }));
  return [...base, ...orderPairs, ...repeats];
}

describe("model judge calibration", () => {
  it("requires 60 unique atomic case-criterion decisions and every required metric", () => {
    const short = summarizeModelJudgeCalibration(Array.from({ length: 59 }, (_, index) => decision(index)));
    expect(short.eligibleForNonP0InformationalUse).toBe(false);
    expect(short.warnings).toContain("MINIMUM_60_CASE_CRITERION_DECISIONS_NOT_MET");

    const completeButMissingStability = summarizeModelJudgeCalibration(
      Array.from({ length: 60 }, (_, index) => decision(index)),
    );
    expect(completeButMissingStability.minimumSampleComplete).toBe(true);
    expect(completeButMissingStability.eligibleForNonP0InformationalUse).toBe(false);
    expect(completeButMissingStability.gateAuthority).toBe(false);
    expect(completeButMissingStability.requiredMetricCoverage.missingMetrics).toEqual(
      expect.arrayContaining(["order_stability", "repeat_stability"]),
    );
    expect(completeButMissingStability.warnings).toContain("P0_RESULTS_ARE_INFORMATIONAL_ONLY");
  });

  it("requires agreement, order, repeat, and adjudication thresholds", () => {
    const summary = summarizeModelJudgeCalibration(wellCalibrated());
    expect(summary.uniqueCaseCriterionCount).toBe(60);
    expect(summary.minimumSampleComplete).toBe(true);
    expect(summary.requiredMetricCoverage.complete).toBe(true);
    expect(summary.orderStability).toMatchObject({ stablePairs: 10, comparedPairs: 10, value: 1 });
    expect(summary.repeatStability).toMatchObject({ stablePairs: 10, comparedPairs: 10, value: 1 });
    expect(summary.adjudicationRate.value).toBe(1);
    expect(summary.eligibleForNonP0InformationalUse).toBe(true);
    expect(summary.gateAuthority).toBe(false);
  });

  it("rejects an order pair whose members do not share scenario and criterion identity", () => {
    const decisions = wellCalibrated();
    decisions[60] = { ...decisions[60]!, scenarioId: "TS-WRONG-IDENTITY" };
    expect(() => summarizeModelJudgeCalibration(decisions)).toThrow(/Malformed order calibration pair/);
  });

  it("rejects incomplete repeat pairs", () => {
    const decisions = wellCalibrated().filter((item) => item.decisionId !== "repeat-run-0");
    expect(() => summarizeModelJudgeCalibration(decisions)).toThrow(/Malformed repeat calibration pair/);
  });

  it("rejects malformed adjudication and makes low adjudication coverage ineligible", () => {
    const malformed = wellCalibrated();
    malformed[20] = {
      ...malformed[20]!,
      adjudicationStatus: "confirmed" as CalibrationDecisionV1["adjudicationStatus"],
    };
    expect(() => summarizeModelJudgeCalibration(malformed)).toThrow(/invalid adjudication status/);

    const pending = wellCalibrated().map((item, index) => {
      if (index < 20 || index >= 25) return item;
      const {
        humanGoldRef: _humanGoldRef,
        adjudicationDecisionId: _adjudicationDecisionId,
        adjudicatorRef: _adjudicatorRef,
        ...withoutAuthority
      } = item;
      return {
        ...withoutAuthority,
        adjudicationStatus: "pending" as const,
        evidenceLocators: [],
      };
    });
    const summary = summarizeModelJudgeCalibration(pending);
    expect(summary.adjudicationRate.value).toBeLessThan(summary.policy.minimumAdjudicationRate);
    expect(summary.eligibleForNonP0InformationalUse).toBe(false);
  });
});
