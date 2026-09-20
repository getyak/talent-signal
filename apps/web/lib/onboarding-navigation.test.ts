import { describe, expect, it } from "vitest";

import {
  ONBOARDING_PATH,
  oauthRetryTarget,
  isOnboardingTarget,
  onboardingCallbackTarget,
  onboardingRequiresStep,
  onboardingStartTarget,
} from "./onboarding-navigation";

describe("onboarding navigation targets", () => {
  it("wraps a safe original target and encodes it", () => {
    expect(onboardingStartTarget("/workspace/pursuits/42?view=open")).toBe(
      `${ONBOARDING_PATH}?callbackUrl=${encodeURIComponent(
        "/workspace/pursuits/42?view=open",
      )}`,
    );
  });

  it("falls back to the workspace for missing or external targets", () => {
    expect(onboardingStartTarget(undefined)).toBe(
      `${ONBOARDING_PATH}?callbackUrl=%2Fworkspace`,
    );
    expect(onboardingStartTarget("https://attacker.test/steal")).toBe(
      `${ONBOARDING_PATH}?callbackUrl=%2Fworkspace`,
    );
    expect(onboardingStartTarget("//attacker.test")).toBe(
      `${ONBOARDING_PATH}?callbackUrl=%2Fworkspace`,
    );
  });

  it("never loops back into onboarding", () => {
    expect(isOnboardingTarget("/onboarding")).toBe(true);
    expect(isOnboardingTarget("/onboarding?callbackUrl=%2Fworkspace")).toBe(true);
    expect(isOnboardingTarget("/onboarding/step")).toBe(true);
    expect(onboardingStartTarget("/onboarding?callbackUrl=%2Fx")).toBe(
      `${ONBOARDING_PATH}?callbackUrl=%2Fworkspace`,
    );
    expect(onboardingCallbackTarget("/onboarding?callbackUrl=%2Fx")).toBe(
      "/workspace",
    );
  });

  it("accepts a safe onboarding callback and rejects unsafe ones", () => {
    expect(onboardingCallbackTarget("/workspace/today")).toBe("/workspace/today");
    expect(onboardingCallbackTarget("https://attacker.test")).toBe("/workspace");
    expect(onboardingCallbackTarget("/\\attacker.test")).toBe("/workspace");
    expect(onboardingCallbackTarget(null)).toBe("/workspace");
  });

  it("recovers the original safe target after OAuth failures", () => {
    expect(oauthRetryTarget("https://app.example/onboarding?callbackUrl=%2Fworkspace%2Fpursuits%2F42", "https://app.example")).toBe("/workspace/pursuits/42");
    expect(oauthRetryTarget("https://attacker.test/onboarding?callbackUrl=%2Fx", "https://app.example")).toBe("/workspace");
    expect(oauthRetryTarget("/onboarding?callbackUrl=https%3A%2F%2Fattacker.test", "https://app.example")).toBe("/workspace");
  });
  it("requires the step only while onboarding is pending", () => {
    expect(onboardingRequiresStep("pending")).toBe(true);
    expect(onboardingRequiresStep("completed")).toBe(false);
    expect(onboardingRequiresStep("skipped")).toBe(false);
    expect(onboardingRequiresStep(undefined)).toBe(false);
  });
});
