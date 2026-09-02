import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  LocalJsonReporter,
  createDeterministicRuntimeDependencies,
  digestCanonicalJson,
} from "@talent-signal/evaluation";
import { describe, expect, it } from "vitest";

import type { EvaluationModeExecutor } from "./contracts.js";
import { ModeDispatcher, assertNoOracleLeak } from "./modeDispatch.js";
import { runEvaluationCase } from "./runSuite.js";
import { emptyReviewBoundary } from "./reviewBoundary.js";
import { createRuntimeForProfile } from "./profileRuntime.js";
import {
  RecordingReporter,
  fixtureRef,
  makeProfile,
  makeScenario,
  makeSuite,
} from "./testFixtures.testHelper.js";

class PassingExecutor implements EvaluationModeExecutor {
  readonly mode = "control_plane_replay" as const;

  async execute(input: Parameters<EvaluationModeExecutor["execute"]>[0]) {
    return {
      schemaVersion: "evaluation-mode-observation.v1" as const,
      mode: this.mode,
      terminalStatus: "completed" as const,
      terminalReasonCode: "OK",
      outcomeStatus: "completed" as const,
      output: { run: { status: "completed" } },
      reviewBoundary: emptyReviewBoundary(),
      trace: [
        {
          schemaVersion: "safe-evaluation-trace.v1" as const,
          traceId: "trace_test_0001",
          attemptId: input.attempt.attemptId,
          ordinal: 0,
          eventKind: "terminal" as const,
          status: "completed" as const,
          outputDigest: digestCanonicalJson({ status: "completed" }),
        },
      ],
      criteria: [
        {
          criterionId: "terminal.truthful",
          status: "pass" as const,
          reasonCode: "TERMINAL_OBSERVED",
          evidenceLocator: "trace:0",
        },
      ],
      violations: [],
      outputDigest: digestCanonicalJson({ outcome: "completed" }),
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:00:00.000Z",
    };
  }
}

describe("runEvaluationCase", () => {
  it("fully commits the local artifact before starting an optional projection", async () => {
    const events: string[] = [];
    const local = new RecordingReporter("local", events);
    const external = new RecordingReporter("external", events);
    const scenario = makeScenario();
    const result = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: local,
      projectionReporters: [external],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });

    expect(result.gate.status).toBe("pass");
    expect(events.indexOf("local:complete")).toBeLessThan(events.indexOf("external:begin"));
  });

  it("does not change the local gate when an external reporter is unavailable", async () => {
    const events: string[] = [];
    const scenario = makeScenario();
    const result = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", events),
      projectionReporters: [new RecordingReporter("opik", events, "begin")],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });

    expect(result.gate.status).toBe("pass");
    expect(result.projectionErrors).toEqual([
      { reporterId: "RecordingReporter", reasonCode: "PROJECTION_REPORTER_FAILED" },
    ]);
  });

  it("writes a content-addressed local artifact without any projection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "talent-signal-eval-runner-"));
    const runtime = createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z"));
    const scenario = makeScenario();
    const result = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new LocalJsonReporter({ outputDirectory: directory, runtime }),
      runtime,
      gitSha: "abcdef1",
    });
    const manifest = JSON.parse(
      await readFile(resolve(directory, "runs", result.manifest.runId, "manifest.json"), "utf8"),
    ) as { contentDigest: string };
    expect(manifest.contentDigest).toBe(result.manifest.contentDigest);
    expect(result.localReceipt.status).toBe("succeeded");
  });

  it("produces the same canonical manifest, result, and gate digests across deterministic reruns", async () => {
    const scenario = makeScenario();
    const profile = makeProfile();
    const directory = await mkdtemp(join(tmpdir(), "talent-signal-deterministic-rerun-"));
    const run = () => {
      const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
      return (
      runEvaluationCase({
        scenario,
        profile,
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new LocalJsonReporter({ outputDirectory: directory, runtime }),
        runtime,
        gitSha: "abcdef1",
      })
      );
    };

    const first = await run();
    const second = await run();
    expect({
      manifest: first.manifest.contentDigest,
      result: first.result.contentDigest,
      gate: first.gate.contentDigest,
      observation: first.observation.outputDigest,
      localArtifact: first.localReceipt.localArtifactDigest,
      runId: first.manifest.runId,
    }).toEqual({
      manifest: second.manifest.contentDigest,
      result: second.result.contentDigest,
      gate: second.gate.contentDigest,
      observation: second.observation.outputDigest,
      localArtifact: second.localReceipt.localArtifactDigest,
      runId: second.manifest.runId,
    });
  });

  it("rejects a wrong-SUT experiment before local reporter side effects", async () => {
    const scenario = makeScenario({
      oracle: {
        ...makeScenario().oracle,
        forbidden: [
          {
            criterionId: "experiment.sut-valid",
            code: "invalid_experiment",
            description: "The tested component cannot be replaced by a fixture.",
            blocker: true,
          },
        ],
      },
    });
    const profile = makeProfile({
      frozenDependencies: [
        {
          bindingId: "frozen-agent-policy",
          component: "agent_policy",
          fixture: fixtureRef("fixture:agent-policy", "fixtures/agent-policy.json"),
          reason: "Seed a deliberately invalid profile for the negative test.",
        },
      ],
    });
    const events: string[] = [];
    await expect(
      runEvaluationCase({
        scenario,
        profile,
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", events),
        runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
        gitSha: "abcdef1",
      }),
    ).rejects.toThrow(/SYSTEM_UNDER_TEST_REPLACED_BY_FIXTURE|Frozen fixture/);
    expect(events).toEqual([]);
  });

  it("rejects an incompatible profile before manifest persistence", async () => {
    const scenario = makeScenario({ compatibleProfileIds: ["identity-replay-v1"] });
    const events: string[] = [];
    await expect(
      runEvaluationCase({
        scenario,
        profile: makeProfile(),
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", events),
        runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
        gitSha: "abcdef1",
      }),
    ).rejects.toThrow(/SCENARIO_PROFILE_INCOMPATIBLE|does not admit profile/);
    expect(events).toEqual([]);
  });

  it("uses distinct content-addressed run IDs for AgentDefinition digest changes", async () => {
    const scenario = makeScenario();
    const profile = makeProfile();
    const run = (version: string, content: string) => {
      const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
      return runEvaluationCase({
        scenario,
        profile,
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        runtime,
        gitSha: "abcdef1",
        agentDefinition: {
          definitionId: "agent-definition",
          version,
          contentDigest: digestCanonicalJson({ content }),
        },
      });
    };
    const first = await run("1", "first");
    const same = await run("1", "first");
    const changedDigest = await run("1", "second");
    expect(same.manifest.runId).toBe(first.manifest.runId);
    expect(changedDigest.manifest.runId).not.toBe(first.manifest.runId);
  });

  it("uses trialNumber as independent attempt identity without changing deterministic output", async () => {
    const scenario = makeScenario();
    const profile = makeProfile();
    const run = (trialNumber: number) => {
      const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
      return runEvaluationCase({
        scenario,
        profile,
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        runtime,
        trialNumber,
        gitSha: "abcdef1",
      });
    };
    const first = await run(1);
    const second = await run(2);
    expect(second.manifest.attempt.trialNumber).toBe(2);
    expect(second.manifest.attempt.attemptId).not.toBe(first.manifest.attempt.attemptId);
    expect(second.manifest.runId).not.toBe(first.manifest.runId);
    expect(second.observation.outputDigest).toBe(first.observation.outputDigest);
  });

  it("uses evaluator/runtime content fingerprints in the immutable run identity", async () => {
    const scenario = makeScenario();
    const profile = makeProfile();
    const run = (implementation: string) => {
      const runtime = createRuntimeForProfile(profile, scenario.contentDigest);
      return runEvaluationCase({
        scenario,
        profile,
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        runtime,
        gitSha: "abcdef1",
        fingerprints: {
          sdk: {
            identityId: "evaluation-runtime",
            version: "source-tree.v1",
            contentDigest: digestCanonicalJson({ implementation }),
          },
        },
      });
    };

    const first = await run("first");
    const same = await run("first");
    const changed = await run("changed");
    expect(same.manifest.runId).toBe(first.manifest.runId);
    expect(changed.manifest.attempt.attemptId).toBe(first.manifest.attempt.attemptId);
    expect(changed.manifest.attempt.contentDigest).not.toBe(first.manifest.attempt.contentDigest);
    expect(changed.manifest.runId).not.toBe(first.manifest.runId);
  });

  it("rejects an oracle key before an executor can see model input", () => {
    expect(() => assertNoOracleLeak({ task: "safe", oracle: { terminal: "pass" } })).toThrowError(
      /EXPECTED_OUTPUT_LEAK|prohibited key/,
    );
  });

  it("fails a P0 run when the terminal matches but an exact oracle observation does not", async () => {
    const base = makeScenario();
    const scenario = makeScenario({
      riskTier: "p0_blocker",
      oracle: {
        ...base.oracle,
        observations: [
          {
            criterionId: "output.status",
            operator: "equals",
            actualPath: "run.status",
            expected: "proposal",
          },
        ],
      },
    });
    const result = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", []),
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });

    expect(result.gate.status).toBe("fail");
    expect(result.gate.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          criterionId: "output.status",
          status: "fail",
          veto: true,
          reasonCode: "ORACLE_OBSERVATION_MISMATCH",
        }),
      ]),
    );
  });
});
