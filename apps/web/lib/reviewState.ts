import type {
  AssertionProposalStatus,
  CandidateMomentumCase,
} from "./candidateMomentum";

export type FactReviewStatus =
  | AssertionProposalStatus
  | "confirmed"
  | "dismissed"
  | "edited";

export type FactReview = {
  originalValue: string;
  status: FactReviewStatus;
  value: string;
};

export type OutcomeStatus =
  | "failed"
  | "pending"
  | "unknown"
  | "verified";

export type CaseReview = {
  actionDecision: "approved" | "declined" | "pending";
  factReviews: Record<string, FactReview>;
  identityResolution: string | null;
  outcome: OutcomeStatus;
  timeResolution: {
    date: string;
    time: string;
    timezone: string;
  } | null;
};

export function createCaseReview(
  fixtureCase: CandidateMomentumCase,
): CaseReview {
  return {
    actionDecision: "pending",
    factReviews: Object.fromEntries(
      fixtureCase.expected.assertions.map((assertion) => [
        assertion.field,
        {
          originalValue: assertion.value,
          status: assertion.status,
          value: assertion.value,
        },
      ]),
    ),
    identityResolution: null,
    outcome: "pending",
    timeResolution: null,
  };
}

export function isFactReviewed(review: FactReview) {
  return (
    review.status === "confirmed" ||
    review.status === "dismissed" ||
    review.status === "edited"
  );
}

export function hasUnresolvedIdentity(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  return Boolean(
    fixtureCase.context.candidate_options?.length &&
      !review.identityResolution,
  );
}

export function getReviewedIdentityLabel(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  return (
    review.identityResolution?.split(" — ")[0]?.trim() ||
    fixtureCase.context.candidate ||
    "身份未解决"
  );
}

export function getReviewedContextLabel(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  if (fixtureCase.context.assignment) return fixtureCase.context.assignment;
  if (!review.identityResolution) return "项目未解决";
  const [, ...contextParts] = review.identityResolution.split(" — ");
  return contextParts.join(" — ").trim() || "背景已选择";
}

export function hasUnresolvedTime(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  return Boolean(
    fixtureCase.expected.assertions.some(
      (assertion) => assertion.status === "ambiguous",
    ) && !review.timeResolution,
  );
}

export function isFactReviewComplete(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  return (
    !hasUnresolvedIdentity(fixtureCase, review) &&
    !hasUnresolvedTime(fixtureCase, review) &&
    Object.values(review.factReviews).every(isFactReviewed)
  );
}

export function canApproveAction(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  return Boolean(
    fixtureCase.expected.action &&
      fixtureCase.expected.disposition === "propose_action" &&
      isFactReviewComplete(fixtureCase, review) &&
      review.actionDecision === "pending",
  );
}

export function getCaseProgress(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  const decisions = Object.values(review.factReviews);
  const total =
    decisions.length +
    (fixtureCase.context.candidate_options?.length ? 1 : 0) +
    (fixtureCase.expected.assertions.some(
      (assertion) => assertion.status === "ambiguous",
    )
      ? 1
      : 0);
  const completed =
    decisions.filter(isFactReviewed).length +
    (fixtureCase.context.candidate_options?.length &&
    review.identityResolution
      ? 1
      : 0) +
    (fixtureCase.expected.assertions.some(
      (assertion) => assertion.status === "ambiguous",
    ) && review.timeResolution
      ? 1
      : 0);

  return { completed, total };
}
