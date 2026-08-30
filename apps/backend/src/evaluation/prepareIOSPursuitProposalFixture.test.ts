import { describe, expect, it } from "vitest";

import {
  isIOSPursuitProposalFixtureLocator,
  isIOSPursuitProposalFixtureTitle,
} from "./prepareIOSPursuitProposalFixture.js";

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

  it.each([
    "synthetic:ios-proposal:canonical:run-id",
    "synthetic:ios-same-name:A:run-id",
    "synthetic:ios-contact:current:run-id",
  ])("recognizes the exact evaluator-owned source namespace %s", (locator) => {
    expect(isIOSPursuitProposalFixtureLocator(locator)).toBe(true);
  });

  it.each([
    "synthetic:ios:contact:current:run-id",
    "synthetic:ios-contact-copy:current:run-id",
    "customer:ios-contact:current:run-id",
  ])("does not broaden fixture deletion to %s", (locator) => {
    expect(isIOSPursuitProposalFixtureLocator(locator)).toBe(false);
  });
});
