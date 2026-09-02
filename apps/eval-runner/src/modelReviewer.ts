import {
  digestContentDocument,
  type EvaluationDataClass,
  type JsonValue,
  type RiskTier,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import type { ModelJudgeCalibrationSummaryV1 } from "./calibration.js";
import { assertNoOracleLeak } from "./modeDispatch.js";

export interface AtomicModelReviewRequestV1 {
  schemaVersion: "atomic-model-review-request.v1";
  reviewId: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  rubricId: string;
  rubricVersion: string;
  riskTier: RiskTier;
  dataClass: EvaluationDataClass;
  blindedInput: JsonValue;
  observedOutput: JsonValue;
}

export interface AtomicModelReviewResponseV1 {
  label: "pass" | "fail" | "abstain";
  reasonCode: string;
  evidenceLocators: string[];
}

export interface ModelJudgeClient {
  review(request: AtomicModelReviewRequestV1): Promise<AtomicModelReviewResponseV1>;
}

export interface InformationalModelReviewV1 {
  schemaVersion: "informational-model-review.v1";
  reviewId: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  evaluatorKind: "model";
  status: "pass" | "fail" | "needs_review" | "not_run";
  reasonCode: string;
  evidenceLocators: string[];
  gateAuthority: false;
  p0Authority: false;
  calibrationDecisionCount: number;
  calibrationEligible: boolean;
  contentDigest: Sha256Digest;
}

export async function runInformationalModelReview(input: {
  request: AtomicModelReviewRequestV1;
  calibration: ModelJudgeCalibrationSummaryV1;
  client?: ModelJudgeClient;
}): Promise<InformationalModelReviewV1> {
  assertNoOracleLeak(input.request.blindedInput);
  assertNoOracleLeak(input.request.observedOutput);
  if (!input.request.criterionId || !input.request.rubricId || !input.request.rubricVersion) {
    throw new Error("Model review must bind one versioned atomic rubric criterion");
  }
  if (!input.request.dataClass.startsWith("synthetic_")) {
    throw new Error("Model review externalization is restricted to approved synthetic data");
  }
  let status: InformationalModelReviewV1["status"];
  let reasonCode: string;
  let evidenceLocators: string[] = [];
  if (!input.client) {
    status = "not_run";
    reasonCode = "NOT_RUN_MISSING_MODEL_REVIEW_CREDENTIALS";
  } else if (!input.calibration.eligibleForNonP0InformationalUse) {
    status = "needs_review";
    reasonCode = "MODEL_REVIEWER_NOT_CALIBRATED";
  } else {
    const response = await input.client.review(input.request);
    status = response.label === "abstain" ? "needs_review" : response.label;
    reasonCode = response.reasonCode;
    evidenceLocators = [...response.evidenceLocators];
    if (evidenceLocators.length === 0) {
      status = "needs_review";
      reasonCode = "MODEL_REVIEW_EVIDENCE_MISSING";
    }
  }
  const partial = {
    schemaVersion: "informational-model-review.v1" as const,
    reviewId: input.request.reviewId,
    scenarioId: input.request.scenarioId,
    attemptId: input.request.attemptId,
    criterionId: input.request.criterionId,
    evaluatorKind: "model" as const,
    status,
    reasonCode,
    evidenceLocators,
    gateAuthority: false as const,
    p0Authority: false as const,
    calibrationDecisionCount: input.calibration.decisionCount,
    calibrationEligible: input.calibration.eligibleForNonP0InformationalUse,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}
