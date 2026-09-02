import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDeterministicRuntimeDependencies,
  digestCanonicalJson,
  type EvaluationScoreV1,
  type SafeEvaluationTraceV1,
} from "@talent-signal/evaluation";
import { describe, expect, it } from "vitest";

import type { EvaluationModeExecutor } from "../contracts.js";
import { ModeDispatcher } from "../modeDispatch.js";
import { ProjectionLedger } from "../projectionLedger.js";
import { runEvaluationCase } from "../runSuite.js";
import { emptyReviewBoundary } from "../reviewBoundary.js";
import {
  RecordingReporter,
  makeProfile,
  makeScenario,
  makeSuite,
} from "../testFixtures.testHelper.js";
import { OpikReporter } from "./opikReporter.js";
import type {
  OpikDatasetSyncReceipt,
  OpikProjectionStart,
  OpikProjectionTransport,
} from "./opikTransport.js";
import type {
  DatasetSyncPlanV1,
  SafeProjectedScoreV1,
  SafeProjectionEnvelopeV1,
} from "../contracts.js";
import type {
  OpikProjectionDeletionTarget,
  OpikProjectionExistence,
} from "./opikTransport.js";

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
      trace: [],
      criteria: [
        {
          criterionId: "terminal.truthful",
          status: "pass" as const,
          reasonCode: "OK",
          evidenceLocator: "trace:0",
        },
      ],
      violations: [],
      outputDigest: digestCanonicalJson({ attemptId: input.attempt.attemptId }),
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:00:00.000Z",
    };
  }
}

class FakeTransport implements OpikProjectionTransport {
  beginCalls = 0;
  traceCalls = 0;
  scoreCalls = 0;
  completeCalls = 0;
  exists = false;
  deletedTarget?: OpikProjectionDeletionTarget;
  constructor(private readonly failBegin: boolean) {}
  async checkConnection() {
    return { reachable: true, reasonCode: "OPIK_REACHABLE" };
  }
  async readDatasetDigest() {
    return undefined;
  }
  async syncDataset(plan: DatasetSyncPlanV1): Promise<OpikDatasetSyncReceipt> {
    return {
      datasetId: "dataset",
      datasetVersionId: "version",
      datasetDigest: plan.desiredDatasetDigest,
      itemCount: plan.itemCount,
      operation: plan.operation,
    };
  }
  async beginProjection(_envelope: SafeProjectionEnvelopeV1): Promise<OpikProjectionStart> {
    this.beginCalls += 1;
    if (this.failBegin) throw new Error("offline");
    this.exists = true;
    return {
      projectionId: "projection",
      externalId: "remote-trace",
      datasetVersionId: "version",
      experimentId: "experiment",
      experimentItemId: "experiment-item",
    };
  }
  async recordTrace(_projectionId: string, _trace: SafeEvaluationTraceV1) {
    this.traceCalls += 1;
  }
  async recordScores(_projectionId: string, _scores: SafeProjectedScoreV1[]) {
    this.scoreCalls += 1;
  }
  async completeProjection() {
    this.completeCalls += 1;
  }
  async deleteProjection(target: OpikProjectionDeletionTarget) {
    this.deletedTarget = target;
    this.exists = false;
  }
  async projectionExists(): Promise<OpikProjectionExistence> {
    return { traceExists: this.exists, experimentLinkExists: this.exists };
  }
  async flush() {}
}

describe("OpikReporter", () => {
  it("records an outage as a failed projection while preserving a passing local gate", async () => {
    const ledgerDirectory = await mkdtemp(join(tmpdir(), "ts-opik-ledger-"));
    const scenario = makeScenario();
    const transport = new FakeTransport(true);
    const reporter = new OpikReporter({
      projectName: "talent-signal-pursuit-agent",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario,
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(ledgerDirectory, {
        now: () => "2026-09-01T00:00:00.000Z",
      }),
      transport,
    });
    const result = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", []),
      projectionReporters: [reporter],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });
    expect(result.gate.status).toBe("pass");
    expect(result.projectionReceipts[0]?.status).toBe("failed");
    expect(transport.beginCalls).toBe(1);
  });

  it("verifies projection deletion by readback", async () => {
    const ledgerDirectory = await mkdtemp(join(tmpdir(), "ts-opik-ledger-"));
    const transport = new FakeTransport(false);
    transport.exists = true;
    const reporter = new OpikReporter({
      projectName: "talent-signal-pursuit-agent",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario: makeScenario(),
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(ledgerDirectory),
      transport,
    });
    const scenario = makeScenario();
    const run = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", []),
      projectionReporters: [reporter],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });
    const receipt = await reporter.deleteProjection({
      reporterId: "opik",
      runId: run.manifest.runId,
      projectionId: run.projectionReceipts[0]!.projectionId,
    });
    expect(receipt).toMatchObject({ status: "deleted", readBackVerified: true });
    expect(transport.deletedTarget).toEqual({
      traceId: "remote-trace",
      experimentId: "experiment",
      experimentItemId: "experiment-item",
    });
    const events = await new ProjectionLedger(ledgerDirectory).readEvents(
      run.projectionReceipts[0]!.projectionId,
    );
    expect(events.at(-1)).toMatchObject({
      externalId: "remote-trace",
      remoteDatasetVersionId: "version",
      experimentId: "experiment",
      experimentItemId: "experiment-item",
    });
    expect(run.projectionReceipts[0]!.localArtifactDigest).toBe(
      run.localReceipt.localArtifactDigest,
    );
    expect(events.every((event) => event.localArtifactDigest === run.localReceipt.localArtifactDigest)).toBe(true);
  });

  it("rejects adversarial trace and score narrative before calling transport", async () => {
    const ledgerDirectory = await mkdtemp(join(tmpdir(), "ts-opik-ledger-"));
    const transport = new FakeTransport(false);
    const scenario = makeScenario();
    const reporter = new OpikReporter({
      projectName: "talent-signal-pursuit-agent",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario,
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(ledgerDirectory),
      transport,
    });
    const run = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", []),
      projectionReporters: [reporter],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });
    const traceCalls = transport.traceCalls;
    await reporter.recordTrace({
      schemaVersion: "safe-evaluation-trace.v1",
      traceId: "trace-adversarial",
      attemptId: run.manifest.attempt.attemptId,
      ordinal: 99,
      eventKind: "candidate narrative alice@example.com",
      status: "observed",
    } as unknown as SafeEvaluationTraceV1);
    expect(transport.traceCalls).toBe(traceCalls);

    const scoreTransport = new FakeTransport(false);
    const scoreReporter = new OpikReporter({
      projectName: "talent-signal-pursuit-agent",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario,
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
      transport: scoreTransport,
    });
    const scoreRun = await runEvaluationCase({
      scenario,
      profile: makeProfile(),
      suite: makeSuite(scenario),
      dispatcher: new ModeDispatcher([new PassingExecutor()]),
      localReporter: new RecordingReporter("local", []),
      projectionReporters: [scoreReporter],
      runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
      gitSha: "abcdef1",
    });
    const scoreCalls = scoreTransport.scoreCalls;
    await scoreReporter.recordScores([
      { ...scoreRun.gate.scores[0]!, reasonCode: "candidate narrative alice@example.com" },
    ]);
    expect(scoreTransport.scoreCalls).toBe(scoreCalls);
  });

  it("rejects narrative, identifier, and path projection names before transport I/O", async () => {
    for (const identity of [
      { projectName: "project narrative with spaces", datasetName: "test-suite" },
      { projectName: "candidate@example.com", datasetName: "test-suite" },
      { projectName: "talent-signal", datasetName: "/Users/owner/private" },
    ]) {
      const transport = new FakeTransport(false);
      const scenario = makeScenario();
      const reporter = new OpikReporter({
        ...identity,
        datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
        scenario,
        ownerControlledInstance: true,
        ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
        transport,
      });
      await runEvaluationCase({
        scenario,
        profile: makeProfile(),
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        projectionReporters: [reporter],
        runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
        gitSha: "abcdef1",
      });
      expect(transport.beginCalls).toBe(0);
    }
  });

  it("rejects opaque unknown enums before trace, score, or terminal transport I/O", async () => {
    const scenario = makeScenario();
    const createRun = async (transport: FakeTransport) => {
      const reporter = new OpikReporter({
        projectName: "talent-signal-pursuit-agent",
        datasetName: "test-suite",
        datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
        scenario,
        ownerControlledInstance: true,
        ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
        transport,
      });
      const run = await runEvaluationCase({
        scenario,
        profile: makeProfile(),
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        projectionReporters: [reporter],
        runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
        gitSha: "abcdef1",
      });
      return { reporter, run };
    };

    const traceTransport = new FakeTransport(false);
    const traceRun = await createRun(traceTransport);
    const traceCalls = traceTransport.traceCalls;
    await traceRun.reporter.recordTrace({
      schemaVersion: "safe-evaluation-trace.v1",
      traceId: "trace-unknown-enum",
      attemptId: traceRun.run.manifest.attempt.attemptId,
      ordinal: 99,
      eventKind: "opaque_unknown_event",
      status: "observed",
    } as unknown as SafeEvaluationTraceV1);
    expect(traceTransport.traceCalls).toBe(traceCalls);

    const scoreTransport = new FakeTransport(false);
    const scoreRun = await createRun(scoreTransport);
    const scoreCalls = scoreTransport.scoreCalls;
    await scoreRun.reporter.recordScores([
      {
        ...scoreRun.run.gate.scores[0]!,
        evaluatorKind: "aggregate_approver",
        status: "approved",
      },
    ] as unknown as EvaluationScoreV1[]);
    expect(scoreTransport.scoreCalls).toBe(scoreCalls);

    const authorityTransport = new FakeTransport(false);
    const authorityRun = await createRun(authorityTransport);
    const authorityScoreCalls = authorityTransport.scoreCalls;
    await authorityRun.reporter.recordScores([
      {
        ...authorityRun.run.gate.scores[0]!,
        gateAuthority: "true",
      },
    ] as unknown as EvaluationScoreV1[]);
    expect(authorityTransport.scoreCalls).toBe(authorityScoreCalls);

    const terminalTransport = new FakeTransport(false);
    const terminalRun = await createRun(terminalTransport);
    const completeCalls = terminalTransport.completeCalls;
    await terminalRun.reporter.completeRun({
      ...terminalRun.run.gate,
      status: "approved",
    } as unknown as typeof terminalRun.run.gate);
    expect(terminalTransport.completeCalls).toBe(completeCalls);
  });

  it("rejects unknown mode or data class before beginProjection transport I/O", async () => {
    const baselineTransport = new FakeTransport(false);
    const baseline = await (async () => {
      const scenario = makeScenario();
      const reporter = new OpikReporter({
        projectName: "talent-signal",
        datasetName: "test-suite",
        datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
        scenario,
        ownerControlledInstance: true,
        ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
        transport: baselineTransport,
      });
      return runEvaluationCase({
        scenario,
        profile: makeProfile(),
        suite: makeSuite(scenario),
        dispatcher: new ModeDispatcher([new PassingExecutor()]),
        localReporter: new RecordingReporter("local", []),
        projectionReporters: [reporter],
        runtime: createDeterministicRuntimeDependencies(Date.parse("2026-09-01T00:00:00Z")),
        gitSha: "abcdef1",
      });
    })();

    const modeTransport = new FakeTransport(false);
    const modeReporter = new OpikReporter({
      projectName: "talent-signal",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario: makeScenario(),
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
      transport: modeTransport,
    });
    modeReporter.setLocalArtifactDigest(baseline.localReceipt.localArtifactDigest);
    await modeReporter.beginRun({
      ...baseline.manifest,
      profile: { ...baseline.manifest.profile, mode: "opaque_unknown_mode" },
    } as unknown as typeof baseline.manifest);
    expect(modeTransport.beginCalls).toBe(0);

    const dataTransport = new FakeTransport(false);
    const dataReporter = new OpikReporter({
      projectName: "talent-signal",
      datasetName: "test-suite",
      datasetDigest: digestCanonicalJson({ suite: "test-suite" }),
      scenario: makeScenario({
        dataPolicy: {
          dataClass: "opaque_unknown_class",
          containsRealCandidateData: false,
          projection: "metadata_only",
        },
      } as unknown as Parameters<typeof makeScenario>[0]),
      ownerControlledInstance: true,
      ledger: new ProjectionLedger(await mkdtemp(join(tmpdir(), "ts-opik-ledger-"))),
      transport: dataTransport,
    });
    dataReporter.setLocalArtifactDigest(baseline.localReceipt.localArtifactDigest);
    await dataReporter.beginRun(baseline.manifest);
    expect(dataTransport.beginCalls).toBe(0);
  });
});
