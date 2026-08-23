import { describe, expect, it } from "vitest";
import {
  getFindingEvidence,
  getHeadlineFindings,
  projectHealthBrief,
} from "./projectHealthBrief";

describe("engineering decision brief contract", () => {
  it("keeps the executive layer concise and decision-led", () => {
    const headlines = getHeadlineFindings();

    expect(headlines).toHaveLength(3);
    expect(projectHealthBrief.headlineFindingIds.length).toBeLessThanOrEqual(3);
    expect(projectHealthBrief.decisionRequest.length).toBeGreaterThan(30);
    expect(projectHealthBrief.status).toBe("draft");
  });

  it("requires every finding to carry evidence and a verification path", () => {
    for (const finding of projectHealthBrief.findings) {
      expect(getFindingEvidence(finding)).toHaveLength(finding.evidenceIds.length);
      expect(finding.evidenceIds.length).toBeGreaterThan(0);
      expect(finding.recommendation.length).toBeGreaterThan(20);
      expect(finding.verification.length).toBeGreaterThan(0);
      expect(finding.unknowns.length).toBeGreaterThan(0);
      expect(finding.causalChain).toHaveLength(5);
      expect(finding.counterevidenceIds.length).toBeGreaterThan(0);
      expect(finding.tradeoffs.length).toBeGreaterThan(0);
      expect(finding.implication.length).toBeGreaterThan(20);
    }
  });

  it("keeps evidence identifiers unique and references inspectable", () => {
    const evidenceIds = projectHealthBrief.evidence.map((evidence) => evidence.id);
    const evidenceIdSet = new Set(evidenceIds);

    expect(evidenceIdSet.size).toBe(evidenceIds.length);
    for (const evidence of projectHealthBrief.evidence) {
      expect(evidence.href).toMatch(/^https:\/\//);
      expect(evidence.locator.length).toBeGreaterThan(5);
      expect(evidence.supports.length).toBeGreaterThan(0);
      expect(evidence.limitations.join("").length).toBeGreaterThan(10);
    }

    for (const finding of projectHealthBrief.findings) {
      for (const evidenceId of finding.counterevidenceIds) {
        expect(evidenceIdSet.has(evidenceId)).toBe(true);
      }
    }
  });

  it("does not present an unsupported final decision as an observed outcome", () => {
    expect(projectHealthBrief.findings.some((finding) => finding.kind === "outcome"))
      .toBe(false);
    expect(projectHealthBrief.options.filter((option) => option.stance === "recommended"))
      .toHaveLength(1);
  });
});
