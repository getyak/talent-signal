import { describe, expect, it } from "vitest";
import { candidateMomentumFixtures } from "./candidateMomentum";
import {
  canApproveAction,
  createCaseReview,
  getReviewedContextLabel,
  getReviewedIdentityLabel,
  hasUnresolvedIdentity,
  hasUnresolvedTime,
  isFactReviewComplete,
} from "./reviewState";

function getCase(id: string) {
  const fixtureCase = candidateMomentumFixtures.cases.find(
    (item) => item.id === id,
  );
  if (!fixtureCase) {
    throw new Error(`Missing fixture ${id}`);
  }
  return fixtureCase;
}

describe("candidate review state", () => {
  it("keeps action approval locked until every TS-CORE-01 fact is reviewed", () => {
    const fixtureCase = getCase("TS-CORE-01");
    const review = createCaseReview(fixtureCase);

    expect(canApproveAction(fixtureCase, review)).toBe(false);
    for (const fact of Object.values(review.factReviews)) {
      fact.status = "confirmed";
    }
    expect(isFactReviewComplete(fixtureCase, review)).toBe(true);
    expect(canApproveAction(fixtureCase, review)).toBe(true);
  });

  it("requires explicit time resolution for an ambiguous relative date", () => {
    const fixtureCase = getCase("TS-CORE-03");
    const review = createCaseReview(fixtureCase);
    review.factReviews.availability.status = "confirmed";

    expect(hasUnresolvedTime(fixtureCase, review)).toBe(true);
    expect(isFactReviewComplete(fixtureCase, review)).toBe(false);
    review.timeResolution = {
      date: "2026-08-14",
      time: "15:00",
      timezone: "Europe/London",
    };
    expect(hasUnresolvedTime(fixtureCase, review)).toBe(false);
    expect(isFactReviewComplete(fixtureCase, review)).toBe(true);
  });

  it("does not bind a same-name identity without a user choice", () => {
    const fixtureCase = getCase("TS-ID-01");
    const review = createCaseReview(fixtureCase);

    expect(hasUnresolvedIdentity(fixtureCase, review)).toBe(true);
    expect(getReviewedIdentityLabel(fixtureCase, review)).toBe("身份未解决");
    expect(getReviewedContextLabel(fixtureCase, review)).toBe("项目未解决");
    review.identityResolution = "Alex Chen — Staff Product Designer";
    expect(hasUnresolvedIdentity(fixtureCase, review)).toBe(false);
    expect(getReviewedIdentityLabel(fixtureCase, review)).toBe("Alex Chen");
    expect(getReviewedContextLabel(fixtureCase, review)).toBe(
      "Staff Product Designer",
    );
  });

  it("never enables actions for no-action, clarify, or blocked cases", () => {
    for (const id of [
      "TS-CORE-02",
      "TS-CORE-03",
      "TS-ID-01",
      "TS-ID-03",
      "TS-BOUND-01",
    ]) {
      const fixtureCase = getCase(id);
      const review = createCaseReview(fixtureCase);
      for (const fact of Object.values(review.factReviews)) {
        fact.status = "confirmed";
      }
      review.identityResolution =
        fixtureCase.context.candidate_options?.[0] ?? null;
      review.timeResolution = {
        date: "2026-08-14",
        time: "15:00",
        timezone: "Europe/London",
      };
      expect(canApproveAction(fixtureCase, review)).toBe(false);
    }
  });
});
