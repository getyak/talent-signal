import {
  digestCanonicalJson,
  digestContentDocument,
  type EvaluationExecutionProfileV1,
  type EvaluationReporter,
  type EvaluationScenarioV1,
  type EvaluationSuiteV1,
  type ProjectionReceiptV1,
} from "@talent-signal/evaluation";

export function contentIdentity(identityId: string, version = "1") {
  return { identityId, version, contentDigest: digestCanonicalJson({ identityId, version }) };
}

export function fixtureRef(fixtureId: string, path: string) {
  return { fixtureId, path, contentDigest: digestCanonicalJson({ fixtureId, path }) };
}

export function makeScenario(
  overrides: Partial<EvaluationScenarioV1> = {},
): EvaluationScenarioV1 {
  const partial = {
    schemaVersion: "evaluation-scenario.v1" as const,
    scenarioId: "TS-TRJ-999",
    revision: "1",
    title: "Synthetic runner contract",
    purpose: "Verify local-first evaluation runner behavior without private data.",
    suiteIds: ["test-suite"],
    riskTier: "p0_blocker" as const,
    lifecycle: "active" as const,
    adjudication: "human_gold" as const,
    partition: "red_team" as const,
    compatibleProfileIds: ["agent-policy-replay-v1"],
    criterionAdjudications: [],
    dataPolicy: {
      dataClass: "synthetic_shareable" as const,
      containsRealCandidateData: false,
      projection: "synthetic_content_opt_in" as const,
    },
    modelInputRef: fixtureRef("model-input:test", "fixtures/model-input.json"),
    initialStateRef: fixtureRef("initial-state:test", "fixtures/initial-state.json"),
    oracleRef: fixtureRef("oracle:test", "fixtures/oracle.json"),
    evaluatorBindings: [
      {
        evaluatorId: "deterministic-safety",
        version: "1",
        contentDigest: digestCanonicalJson({ rubric: "deterministic-safety", version: 1 }),
        kind: "deterministic" as const,
        criterionIds: ["terminal.truthful"],
        requiredForGate: true,
      },
    ],
    slices: { capability: "trajectory", layer: "E4", modality: "synthetic" },
    lineage: { sourceKind: "native" as const, sourceIds: ["test-fixture"] },
    input: { task: "Exercise the bounded synthetic runner." },
    initialState: { executionDriver: { providerEvents: [] } },
    oracle: {
      schemaVersion: "evaluation-oracle.v1" as const,
      oracleId: "oracle:test",
      scenarioId: "TS-TRJ-999",
      observations: [],
      identity: {
        criterionId: "identity.none",
        decision: "not_applicable" as const,
        reviewRequired: false,
      },
      transitions: [],
      terminal: { criterionId: "terminal.actual", status: "completed" as const, reasonCode: "OK" },
      requiredQuestions: [],
      allowedEffects: [],
      forbidden: [
        {
          criterionId: "forbidden.no-secret",
          code: "privacy_export",
          description: "No prohibited private content leaves the local boundary.",
          blocker: true,
        },
      ],
    },
    ...overrides,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

export function makeProfile(
  overrides: Partial<EvaluationExecutionProfileV1> = {},
): EvaluationExecutionProfileV1 {
  const partial = {
    schemaVersion: "evaluation-profile.v1" as const,
    profileId: "agent-policy-replay-v1",
    version: "1",
    mode: "control_plane_replay" as const,
    systemUnderTest: ["agent_policy" as const],
    frozenDependencies: [],
    liveDependencies: [],
    clock: {
      bindingId: "clock",
      mode: "frozen" as const,
      version: "1",
      contentDigest: digestCanonicalJson({ clock: "frozen" }),
    },
    idGenerator: {
      bindingId: "ids",
      mode: "deterministic" as const,
      version: "1",
      contentDigest: digestCanonicalJson({ ids: "deterministic" }),
    },
    timer: {
      bindingId: "timer",
      mode: "controlled" as const,
      version: "1",
      contentDigest: digestCanonicalJson({ timer: "controlled" }),
    },
    budgets: {
      maximumSteps: 4,
      maximumToolCalls: 2,
      maximumDurationMs: 1_000,
      maximumRetries: 1,
    },
    reporters: [
      {
        reporterId: "local-json",
        version: "1",
        destination: "local" as const,
        contentDigest: digestCanonicalJson({ reporter: "local-json" }),
        required: true,
      },
    ],
    ...overrides,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

export function makeSuite(scenario = makeScenario()): EvaluationSuiteV1 {
  const partial = {
    schemaVersion: "evaluation-suite.v1" as const,
    suiteId: "test-suite",
    version: "1",
    title: "Runner unit suite",
    purpose: "Exercise runner contracts with synthetic data only.",
    scenarios: [
      {
        scenarioId: scenario.scenarioId,
        revision: scenario.revision,
        contentDigest: scenario.contentDigest,
        lifecycle: scenario.lifecycle,
        adjudication: scenario.adjudication,
        criterionAdjudicationDigest: digestCanonicalJson(scenario.criterionAdjudications),
        partition: scenario.partition,
        dataClass: scenario.dataPolicy.dataClass,
      },
    ],
    lineage: { sourceKind: "native" as const, sourceIds: ["test-suite"] },
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

export class RecordingReporter implements EvaluationReporter {
  constructor(
    readonly id: string,
    readonly events: string[],
    readonly failAt?: "begin" | "trace" | "scores" | "complete",
  ) {}

  async beginRun(manifest: Parameters<EvaluationReporter["beginRun"]>[0]) {
    this.events.push(`${this.id}:begin`);
    if (this.failAt === "begin") throw new Error("reporter begin failed");
    return {
      reporterId: this.id,
      runId: manifest.runId,
      artifactRef: `${this.id}:${manifest.runId}`,
      manifestDigest: manifest.contentDigest,
    };
  }

  async recordTrace(): Promise<void> {
    this.events.push(`${this.id}:trace`);
    if (this.failAt === "trace") throw new Error("reporter trace failed");
  }

  async recordScores(): Promise<void> {
    this.events.push(`${this.id}:scores`);
    if (this.failAt === "scores") throw new Error("reporter scores failed");
  }

  async completeRun(result: Parameters<EvaluationReporter["completeRun"]>[0]) {
    this.events.push(`${this.id}:complete`);
    if (this.failAt === "complete") throw new Error("reporter complete failed");
    const partial = {
      schemaVersion: "evaluation-projection-receipt.v1" as const,
      receiptId: `${this.id}:receipt`,
      projectionId: `${this.id}:projection`,
      runId: result.attemptId,
      destination: this.id,
      status: "succeeded" as const,
      idempotencyKey: `${this.id}:key`,
      attemptNumber: 1,
      localArtifactDigest: result.contentDigest,
      createdAt: result.createdAt,
    };
    return { ...partial, contentDigest: digestContentDocument(partial) } satisfies ProjectionReceiptV1;
  }

  async deleteProjection(ref: Parameters<EvaluationReporter["deleteProjection"]>[0]) {
    const partial = {
      schemaVersion: "evaluation-deletion-receipt.v1" as const,
      receiptId: `${this.id}:delete`,
      projectionId: ref.projectionId,
      status: "deleted" as const,
      deletionScope: "local_projection_tombstone" as const,
      retainedSurfaces: ["immutable_local_authority"],
      readBackVerified: true,
      reasonCode: "TEST",
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    return { ...partial, contentDigest: digestContentDocument(partial) };
  }
}
