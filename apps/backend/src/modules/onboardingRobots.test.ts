import { describe, expect, it } from "vitest";
import { profileRobotsAllows } from "./onboardingRobots.js";
describe("profile robots policy", () => {
  const url = (path: string) => new URL(path, "https://example.com");
  it("honors bot-specific denies and grouped agents", () => {
    expect(profileRobotsAllows("User-agent: Other\nUser-agent: TalentSignalResearchBot\nDisallow: /private", url("/private/about"))).toBe(false);
  });
  it("gives a specific bot group precedence over wildcard groups", () => {
    expect(profileRobotsAllows("User-agent: *\nAllow: /about\nUser-agent: TalentSignalResearchBot\nDisallow: /", url("/about"))).toBe(false);
  });
  it("handles adversarial wildcard input without regex backtracking", () => {
    expect(profileRobotsAllows(`User-agent: *\nDisallow: /${"*a".repeat(100)}b`, url("/" + "a".repeat(2000)))).toBe(true);
  });
  it("matches wildcards, terminal rules and the longest allow", () => {
    const rules = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /private\nAllow: /private/about";
    expect(profileRobotsAllows(rules, url("/resume.pdf"))).toBe(false);
    expect(profileRobotsAllows(rules, url("/private"))).toBe(false);
    expect(profileRobotsAllows(rules, url("/private/about"))).toBe(true);
    expect(profileRobotsAllows(rules, url("/about"))).toBe(true);
  });
});
