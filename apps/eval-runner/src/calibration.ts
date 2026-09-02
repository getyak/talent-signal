export type CalibrationLabel = "pass" | "fail" | "abstain";

export interface CalibrationDecisionV1 {
  decisionId: string;
  scenarioId: string;
  criterionId: string;
  riskTier: "p0_blocker" | "p1_core" | "p2_quality";
  humanLabel: Exclude<CalibrationLabel, "abstain">;
  modelLabel: CalibrationLabel;
  adjudicationStatus: "adjudicated" | "pending";
  humanGoldRef?: string;
  adjudicationDecisionId?: string;
  adjudicatorRef?: string;
  evidenceLocators: string[];
  orderPairId?: string;
  order: "original" | "swapped" | "not_pairwise";
  repeatPairId?: string;
  repeat: "original" | "repeat" | "not_repeat";
}

export interface ModelJudgeCalibrationSummaryV1 {
  schemaVersion: "model-judge-calibration-summary.v1";
  decisionCount: number;
  uniqueCaseCriterionCount: number;
  minimumSampleComplete: boolean;
  eligibleForNonP0InformationalUse: boolean;
  gateAuthority: false;
  minimumDecisionCount: 60;
  confusionMatrix: {
    humanPassModelPass: number;
    humanPassModelFail: number;
    humanFailModelPass: number;
    humanFailModelFail: number;
  };
  rawAgreement: { numerator: number; denominator: number; value: number | null };
  falsePass: { numerator: number; denominator: number; value: number | null };
  falseFail: { numerator: number; denominator: number; value: number | null };
  abstention: { numerator: number; denominator: number; value: number | null };
  orderStability: { stablePairs: number; comparedPairs: number; value: number | null };
  repeatStability: { stablePairs: number; comparedPairs: number; value: number | null };
  adjudicationRate: { adjudicated: number; total: number; value: number | null };
  requiredMetricCoverage: {
    requiredMetrics: string[];
    missingMetrics: string[];
    complete: boolean;
  };
  p0DecisionCount: number;
  warnings: string[];
  policy: {
    minimumRawAgreement: number;
    maximumFalsePass: number;
    maximumFalseFail: number;
    maximumAbstention: number;
    minimumOrderStability: number;
    minimumComparedOrderPairs: number;
    minimumRepeatStability: number;
    minimumComparedRepeatPairs: number;
    minimumAdjudicationRate: number;
  };
}

const POLICY = {
  minimumRawAgreement: 0.8,
  maximumFalsePass: 0.05,
  maximumFalseFail: 0.2,
  maximumAbstention: 0.2,
  minimumOrderStability: 0.8,
  minimumComparedOrderPairs: 10,
  minimumRepeatStability: 0.8,
  minimumComparedRepeatPairs: 10,
  minimumAdjudicationRate: 0.95,
} as const;

const REQUIRED_METRICS = [
  "raw_agreement",
  "false_pass",
  "false_fail",
  "abstention",
  "order_stability",
  "repeat_stability",
  "adjudication_rate",
] as const;

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function summarizeModelJudgeCalibration(
  decisions: readonly CalibrationDecisionV1[],
): ModelJudgeCalibrationSummaryV1 {
  const ids = new Set<string>();
  for (const item of decisions) {
    if (ids.has(item.decisionId)) throw new Error(`Duplicate calibration decision: ${item.decisionId}`);
    ids.add(item.decisionId);
    if (!item.scenarioId || !item.criterionId) {
      throw new Error(`Calibration decision must bind one atomic criterion: ${item.decisionId}`);
    }
    if (item.adjudicationStatus !== "adjudicated" && item.adjudicationStatus !== "pending") {
      throw new Error(`Calibration decision has invalid adjudication status: ${item.decisionId}`);
    }
    const authorityValues = [item.humanGoldRef, item.adjudicationDecisionId, item.adjudicatorRef];
    if (item.adjudicationStatus === "adjudicated") {
      if (authorityValues.some((value) => !value) || item.evidenceLocators.length === 0) {
        throw new Error(`Adjudicated calibration decision lacks named human-gold evidence: ${item.decisionId}`);
      }
    } else if (authorityValues.some((value) => value !== undefined) || item.evidenceLocators.length > 0) {
      throw new Error(`Pending calibration decision cannot claim human-gold authority: ${item.decisionId}`);
    }
    for (const value of [...authorityValues.filter((item): item is string => item !== undefined), ...item.evidenceLocators]) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,499}$/.test(value)) {
        throw new Error(`Calibration authority reference must be opaque and bounded: ${item.decisionId}`);
      }
    }
    if ((item.orderPairId === undefined) !== (item.order === "not_pairwise")) {
      throw new Error(`Calibration decision has malformed order-pair membership: ${item.decisionId}`);
    }
    if ((item.repeatPairId === undefined) !== (item.repeat === "not_repeat")) {
      throw new Error(`Calibration decision has malformed repeat-pair membership: ${item.decisionId}`);
    }
  }

  const judged = decisions.filter((item) => item.modelLabel !== "abstain");
  const hpmp = judged.filter((item) => item.humanLabel === "pass" && item.modelLabel === "pass").length;
  const hpmf = judged.filter((item) => item.humanLabel === "pass" && item.modelLabel === "fail").length;
  const hfmp = judged.filter((item) => item.humanLabel === "fail" && item.modelLabel === "pass").length;
  const hfmf = judged.filter((item) => item.humanLabel === "fail" && item.modelLabel === "fail").length;
  const humanPass = decisions.filter((item) => item.humanLabel === "pass").length;
  const humanFail = decisions.filter((item) => item.humanLabel === "fail").length;
  const abstentions = decisions.length - judged.length;

  const pairGroups = new Map<string, CalibrationDecisionV1[]>();
  for (const item of decisions) {
    if (!item.orderPairId) continue;
    pairGroups.set(item.orderPairId, [...(pairGroups.get(item.orderPairId) ?? []), item]);
  }
  const comparablePairs = [...pairGroups.entries()].map(([pairId, items]) => {
    assertValidPair(pairId, items, "order");
    return items;
  });
  const stablePairs = comparablePairs.filter((items) => items[0]!.modelLabel === items[1]!.modelLabel).length;

  const repeatGroups = new Map<string, CalibrationDecisionV1[]>();
  for (const item of decisions) {
    if (!item.repeatPairId) continue;
    repeatGroups.set(item.repeatPairId, [...(repeatGroups.get(item.repeatPairId) ?? []), item]);
  }
  const comparableRepeats = [...repeatGroups.entries()].map(([pairId, items]) => {
    assertValidPair(pairId, items, "repeat");
    return items;
  });
  const stableRepeats = comparableRepeats.filter(
    (items) => items[0]!.modelLabel === items[1]!.modelLabel,
  ).length;
  const warnings: string[] = [];
  const uniqueCaseCriterionCount = new Set(
    decisions.map((item) => `${item.scenarioId}\u0000${item.criterionId}`),
  ).size;
  if (uniqueCaseCriterionCount < 60) warnings.push("MINIMUM_60_CASE_CRITERION_DECISIONS_NOT_MET");
  if (comparablePairs.length === 0) warnings.push("ORDER_STABILITY_SAMPLE_MISSING");
  if (comparableRepeats.length === 0) warnings.push("REPEAT_STABILITY_SAMPLE_MISSING");
  if (decisions.some((item) => item.riskTier === "p0_blocker")) {
    warnings.push("P0_RESULTS_ARE_INFORMATIONAL_ONLY");
  }

  const rawAgreement = ratio(hpmp + hfmf, judged.length);
  const falsePass = ratio(hfmp, humanFail);
  const falseFail = ratio(hpmf, humanPass);
  const abstention = ratio(abstentions, decisions.length);
  const orderStability = ratio(stablePairs, comparablePairs.length);
  const repeatStability = ratio(stableRepeats, comparableRepeats.length);
  const adjudicated = decisions.filter(
    (item) =>
      item.adjudicationStatus === "adjudicated" &&
      item.humanGoldRef &&
      item.adjudicationDecisionId &&
      item.adjudicatorRef &&
      item.evidenceLocators.length > 0,
  ).length;
  const adjudicationRate = ratio(adjudicated, decisions.length);
  const missingMetrics = [
    ...(rawAgreement === null ? ["raw_agreement"] : []),
    ...(falsePass === null ? ["false_pass"] : []),
    ...(falseFail === null ? ["false_fail"] : []),
    ...(abstention === null ? ["abstention"] : []),
    ...(orderStability === null || comparablePairs.length < POLICY.minimumComparedOrderPairs
      ? ["order_stability"]
      : []),
    ...(repeatStability === null || comparableRepeats.length < POLICY.minimumComparedRepeatPairs
      ? ["repeat_stability"]
      : []),
    ...(adjudicationRate === null ? ["adjudication_rate"] : []),
  ];
  const requiredMetricCoverageComplete = missingMetrics.length === 0;
  if (!requiredMetricCoverageComplete) warnings.push("RUBRIC_REQUIRED_METRICS_MISSING");
  const minimumSampleComplete = uniqueCaseCriterionCount >= 60;
  const eligibleForNonP0InformationalUse =
    minimumSampleComplete &&
    requiredMetricCoverageComplete &&
    rawAgreement !== null &&
    rawAgreement >= POLICY.minimumRawAgreement &&
    falsePass !== null &&
    falsePass <= POLICY.maximumFalsePass &&
    falseFail !== null &&
    falseFail <= POLICY.maximumFalseFail &&
    abstention !== null &&
    abstention <= POLICY.maximumAbstention &&
    comparablePairs.length >= POLICY.minimumComparedOrderPairs &&
    orderStability !== null &&
    orderStability >= POLICY.minimumOrderStability &&
    comparableRepeats.length >= POLICY.minimumComparedRepeatPairs &&
    repeatStability !== null &&
    repeatStability >= POLICY.minimumRepeatStability &&
    adjudicationRate !== null &&
    adjudicationRate >= POLICY.minimumAdjudicationRate;
  if (minimumSampleComplete && !eligibleForNonP0InformationalUse) {
    warnings.push("CALIBRATION_POLICY_THRESHOLDS_NOT_MET");
  }

  return {
    schemaVersion: "model-judge-calibration-summary.v1",
    decisionCount: decisions.length,
    uniqueCaseCriterionCount,
    minimumSampleComplete,
    eligibleForNonP0InformationalUse,
    gateAuthority: false,
    minimumDecisionCount: 60,
    confusionMatrix: {
      humanPassModelPass: hpmp,
      humanPassModelFail: hpmf,
      humanFailModelPass: hfmp,
      humanFailModelFail: hfmf,
    },
    rawAgreement: {
      numerator: hpmp + hfmf,
      denominator: judged.length,
      value: rawAgreement,
    },
    falsePass: { numerator: hfmp, denominator: humanFail, value: falsePass },
    falseFail: { numerator: hpmf, denominator: humanPass, value: falseFail },
    abstention: {
      numerator: abstentions,
      denominator: decisions.length,
      value: abstention,
    },
    orderStability: {
      stablePairs,
      comparedPairs: comparablePairs.length,
      value: orderStability,
    },
    repeatStability: {
      stablePairs: stableRepeats,
      comparedPairs: comparableRepeats.length,
      value: repeatStability,
    },
    adjudicationRate: {
      adjudicated,
      total: decisions.length,
      value: adjudicationRate,
    },
    requiredMetricCoverage: {
      requiredMetrics: [...REQUIRED_METRICS],
      missingMetrics,
      complete: requiredMetricCoverageComplete,
    },
    p0DecisionCount: decisions.filter((item) => item.riskTier === "p0_blocker").length,
    warnings,
    policy: POLICY,
  };
}

function assertValidPair(
  pairId: string,
  items: CalibrationDecisionV1[],
  kind: "order" | "repeat",
): void {
  const expectedLabels = kind === "order" ? ["original", "swapped"] : ["original", "repeat"];
  const labels = items.map((item) => (kind === "order" ? item.order : item.repeat));
  const identity = items[0] ? `${items[0].scenarioId}\u0000${items[0].criterionId}` : "";
  const sameIdentity = items.every(
    (item) => `${item.scenarioId}\u0000${item.criterionId}` === identity,
  );
  const sameGold = items.every(
    (item) =>
      item.humanLabel === items[0]?.humanLabel &&
      item.riskTier === items[0]?.riskTier &&
      item.adjudicationStatus === items[0]?.adjudicationStatus &&
      item.humanGoldRef === items[0]?.humanGoldRef &&
      item.adjudicationDecisionId === items[0]?.adjudicationDecisionId &&
      item.adjudicatorRef === items[0]?.adjudicatorRef,
  );
  if (
    items.length !== 2 ||
    !expectedLabels.every((label) => labels.filter((item) => item === label).length === 1) ||
    !sameIdentity ||
    !sameGold
  ) {
    throw new Error(`Malformed ${kind} calibration pair: ${pairId}`);
  }
}
