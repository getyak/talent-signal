import { describe, expect, it } from "vitest";

import { isIOSPursuitProposalFixtureTitle } from "./prepareIOSPursuitProposalFixture.js";

describe("iOS Pursuit Proposal fixture lifecycle", () => {
  it.each([
    "Chief Product Officer · Meridian Labs",
    "VP Engineering · Northstar",
    "Synthetic same-name search",
  ])("recognizes the exact evaluator-owned Pursuit title %s", (title) => {
    expect(isIOSPursuitProposalFixtureTitle(title)).toBe(true);
  });

  it("does not classify an ordinary Pursuit as evaluator-owned", () => {
    expect(
      isIOSPursuitProposalFixtureTitle("Chief Product Officer · Customer"),
    ).toBe(false);
  });
});
