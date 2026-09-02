import { describe, expect, it } from "vitest";

import {
  ExportPolicyError,
  decideExport,
  projectSafeScore,
  scanSafeExport,
} from "./safeExportPolicy.js";
import { makeScenario } from "./testFixtures.testHelper.js";

describe("safe export policy", () => {
  it("does not mistake digests or UUIDs for phone numbers", () => {
    expect(() =>
      scanSafeExport({
        digest: `sha256:${"1".repeat(64)}`,
        id: "12345678-1234-8123-8123-123456789012",
      }),
    ).not.toThrow();
  });

  it("accepts a validated artifact-relative JSON Pointer without treating it as a local path", () => {
    expect(() =>
      projectSafeScore({
        schemaVersion: "evaluation-score.v1",
        scoreId: "score-1",
        scenarioId: "TS-TRJ-005",
        attemptId: "attempt-1",
        capability: "trajectory",
        criterionId: "source-bound",
        evaluatorId: "deterministic-safety",
        evaluatorVersion: "1",
        evaluatorKind: "deterministic",
        riskTier: "p0_blocker",
        status: "pass",
        gateAuthority: true,
        veto: false,
        evidence: [{ artifactId: "attempt-1", jsonPointer: "/output/run/trajectorySummary" }],
        reasonCode: "SOURCE_BOUND",
      }),
    ).not.toThrow();
  });

  it("blocks direct identifiers, secrets, paths, and raw private fields before SDK use", () => {
    expect(() => scanSafeExport({ bounded_label: "+86 138-0013-8000" })).toThrow(ExportPolicyError);
    expect(() => scanSafeExport({ rawPrompt: "private message" })).toThrow(ExportPolicyError);
    expect(() => scanSafeExport({ path_hint: "/Users/owner/private.json" })).toThrow(ExportPolicyError);
    expect(() => scanSafeExport({ bounded_label: "Bearer secret-token-value" })).toThrow(ExportPolicyError);
  });

  it("requires an owner-controlled instance for restricted synthetic content", () => {
    const scenario = makeScenario({
      dataPolicy: {
        dataClass: "synthetic_restricted",
        containsRealCandidateData: false,
        projection: "metadata_only",
      },
    });
    expect(decideExport(scenario, false)).toMatchObject({
      allowed: false,
      reasonCode: "OWNER_CONTROL_REQUIRED",
    });
    expect(decideExport(scenario, true).allowed).toBe(true);
  });
});
