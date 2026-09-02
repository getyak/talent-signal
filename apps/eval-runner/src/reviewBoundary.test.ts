import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createDefaultModeDispatcher, parseRemoteModeResponse } from "./builtinExecutors.js";
import { findProfile, findScenario, findSuite, loadEvaluationRepository } from "./repository.js";
import { createRuntimeForProfile, runtimeDispatchClock } from "./profileRuntime.js";
import { validateReviewBoundary } from "./reviewBoundary.js";
import { runEvaluationCase } from "./runSuite.js";
import { RecordingReporter } from "./testFixtures.testHelper.js";

describe("review boundary", () => {
  it("rejects collapsed categories and unresolved evidence references", () => {
    expect(() =>
      validateReviewBoundary({
        schemaVersion: "evaluation-review-boundary.v1",
        evidence: [{ evidenceRef: "evidence:1" }],
        confirmedState: [{ interpretationRef: "interpretation:1", evidenceRefs: ["evidence:1"] }],
        interpretations: [],
        proposedActions: [],
        observedOutcomes: [],
      }),
    ).toThrow(/EXACT_KEYS/);
    expect(() =>
      validateReviewBoundary({
        schemaVersion: "evaluation-review-boundary.v1",
        evidence: [{ evidenceRef: "evidence:1" }],
        confirmedState: [],
        interpretations: [{ interpretationRef: "interpretation:1", evidenceRefs: ["evidence:missing"] }],
        proposedActions: [],
        observedOutcomes: [],
      }),
    ).toThrow(/EVIDENCE_UNRESOLVED/);
  });

  it("rejects a remote response with a missing or collapsed review boundary", () => {
    expect(() =>
      parseRemoteModeResponse({ outcomeStatus: "proposal", terminalReasonCode: "PROPOSAL", output: {} }),
    ).toThrow(/response contract/);
    expect(() =>
      parseRemoteModeResponse({
        outcomeStatus: "proposal",
        terminalReasonCode: "PROPOSAL",
        output: {},
        reviewBoundary: {
          schemaVersion: "evaluation-review-boundary.v1",
          evidence: "source narrative",
          confirmedState: [],
          interpretations: [],
          proposedActions: [],
          observedOutcomes: [],
        },
      }),
    ).toThrow(/ARRAY_REQUIRED/);
  });

  it("keeps a memory proposal out of confirmed state and binds effect readback as observed", async () => {
    const workspaceRoot = resolve(import.meta.dirname, "../../..");
    const repository = await loadEvaluationRepository(resolve(workspaceRoot, "evals/v2"), workspaceRoot);
    const run = async (scenarioId: string) => {
      const scenario = findScenario(repository, scenarioId);
      const profile = findProfile(repository, scenario.slices.defaultProfileId!);
      const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
      return runEvaluationCase({
        scenario,
        profile,
        suite: findSuite(repository, "p0-release"),
        dispatcher: createDefaultModeDispatcher({}, runtimeDispatchClock(runtime)),
        localReporter: new RecordingReporter("local", []),
        runtime,
        gitSha: "abcdef1",
      });
    };
    const memory = await run("TS-MEM-001");
    expect(memory.observation.reviewBoundary.confirmedState).toEqual([]);
    expect(memory.observation.reviewBoundary.interpretations).toHaveLength(1);
    expect(memory.observation.reviewBoundary.proposedActions).toMatchObject([
      { requiresHumanReview: true },
    ]);
    const effect = await run("TS-ACT-105");
    expect(effect.observation.reviewBoundary.observedOutcomes).toMatchObject([
      { status: "observed" },
    ]);
  });
});
