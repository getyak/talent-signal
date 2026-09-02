import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ContentIdentityV1,
  EvaluationAttemptV1,
  EvaluationExecutionProfileV1,
  EvaluationRunManifestV1,
  EvaluationScenarioDocumentV1,
  EvaluationScoreV1,
  EvaluationSuiteV1,
  ScenarioInitialStateV1,
  ScenarioInitialStateFixtureV1,
  ScenarioModelInputV1,
  ScenarioModelInputFixtureV1,
  ScenarioOracleV1,
} from "./contracts.js";
import { canonicalJson, CanonicalJsonError } from "./canonicalJson.js";
import { scanPartitionContamination } from "./contamination.js";
import {
  collectAdjudicableCriterionIds,
  deriveScenarioAdjudication,
  digestCriterionAdjudications,
} from "./adjudication.js";
import { digestCanonicalJson, digestContentDocument } from "./digest.js";
import { evaluateCapabilityGates } from "./gates.js";
import { LocalJsonReporter } from "./localJsonReporter.js";
import { adaptLegacyScenarios, EvaluationRegistry } from "./registry.js";
import { createDeterministicRuntimeDependencies } from "./runtimeDependencies.js";
import {
  buildModelVisibleInput,
  createEvaluationAttemptId,
  materializeScenario,
  validateAttemptAgainstProfile,
  validateDeletionReceipt,
  validateMaterializedScenario,
  validateProfile,
  validateProjectionReceipt,
  validateResult,
  validateRunManifest,
  validateScenarioDocument,
  validateSuite,
} from "./validate.js";

const FIXED_DIGEST = `sha256:${"a".repeat(64)}` as const;
const FIXED_TIME = "2026-09-01T00:00:00.000Z";

function contentIdentity(identityId: string, version = "1"): ContentIdentityV1 {
  return { identityId, version, contentDigest: FIXED_DIGEST };
}

function makeScenarioMaterials(): {
  input: ScenarioModelInputV1;
  initialState: ScenarioInitialStateV1;
  modelInputFixture: ScenarioModelInputFixtureV1;
  initialStateFixture: ScenarioInitialStateFixtureV1;
  oracle: ScenarioOracleV1;
} {
  const input = {
    task: "Prepare a bounded proposal from synthetic evidence",
    source: { sourceRef: "synthetic-message-1", kind: "synthetic_message" },
  };
  const initialState = { people: [], confirmedClaims: [] };
  return {
    input,
    initialState,
    modelInputFixture: {
      schemaVersion: "evaluation-model-input.v1",
      fixtureId: "model-input-TS-ID-103",
      dataClass: "synthetic_restricted",
      scenarioId: "TS-ID-103",
      input,
    },
    initialStateFixture: {
      schemaVersion: "evaluation-initial-state.v1",
      fixtureId: "initial-state-TS-ID-103",
      scenarioId: "TS-ID-103",
      state: initialState,
    },
    oracle: {
      schemaVersion: "evaluation-oracle.v1",
      oracleId: "oracle-TS-ID-103",
      scenarioId: "TS-ID-103",
      observations: [
        {
          criterionId: "observation-grounded",
          operator: "equals",
          actualPath: "run.observation.sourceRef",
          expected: { sourceRef: "synthetic-message-1" },
        },
      ],
      identity: {
        criterionId: "identity-abstains",
        decision: "abstain",
        reviewRequired: true,
        evidenceRefs: ["synthetic-message-1"],
      },
      transitions: [
        {
          criterionId: "state-remains-proposed",
          operation: "propose",
          target: "candidate_claim",
          authority: "proposed",
          evidenceRefs: ["synthetic-message-1"],
        },
      ],
      terminal: {
        criterionId: "terminal-abstain",
        status: "abstain",
        reasonCode: "identity_ambiguous",
      },
      requiredQuestions: ["Which person did you mean?"],
      allowedEffects: [],
      forbidden: [
        {
          criterionId: "wrong-person-binding",
          code: "wrong_person_binding",
          description: "The system must never bind an ambiguous source to a Person",
          blocker: true,
        },
      ],
    },
  };
}

function makeScenario(): EvaluationScenarioDocumentV1 {
  const materials = makeScenarioMaterials();
  const withoutDigest = {
    schemaVersion: "evaluation-scenario.v1" as const,
    scenarioId: "TS-ID-103",
    revision: "1",
    title: "Ambiguous same-name identity",
    purpose: "Require abstention when identity evidence is insufficient",
    suiteIds: ["p0-identity"],
    riskTier: "p0_blocker" as const,
    lifecycle: "active" as const,
    adjudication: "unreviewed" as const,
    partition: "p0" as const,
    compatibleProfileIds: ["agent-policy-control-plane"],
    criterionAdjudications: [],
    dataPolicy: {
      dataClass: "synthetic_restricted" as const,
      containsRealCandidateData: false,
      projection: "metadata_only" as const,
    },
    modelInputRef: {
      fixtureId: "model-input-TS-ID-103",
      path: "evals/v2/fixtures/model-inputs/TS-ID-103.json",
      contentDigest: digestCanonicalJson(materials.modelInputFixture),
    },
    initialStateRef: {
      fixtureId: "initial-state-TS-ID-103",
      path: "evals/v2/fixtures/states/TS-ID-103.json",
      contentDigest: digestCanonicalJson(materials.initialStateFixture),
    },
    oracleRef: {
      fixtureId: "oracle-TS-ID-103",
      path: "evals/v2/fixtures/oracles/TS-ID-103.json",
      contentDigest: digestCanonicalJson(materials.oracle),
    },
    evaluatorBindings: [
      {
        evaluatorId: "identity-oracle",
        version: "1",
        contentDigest: FIXED_DIGEST,
        kind: "deterministic" as const,
        criterionIds: ["identity-abstains"],
        requiredForGate: true,
      },
    ],
    slices: { capability: "identity", source: "synthetic" },
    lineage: { sourceKind: "native" as const, sourceIds: ["TS-ID-103"] },
  };
  return { ...withoutDigest, contentDigest: digestCanonicalJson(withoutDigest) };
}

function makeProfile(): EvaluationExecutionProfileV1 {
  const withoutDigest = {
    schemaVersion: "evaluation-profile.v1" as const,
    profileId: "agent-policy-control-plane",
    version: "1",
    mode: "control_plane_replay" as const,
    systemUnderTest: ["agent_policy" as const],
    frozenDependencies: [
      {
        bindingId: "search-fixture",
        component: "search" as const,
        fixture: {
          fixtureId: "search-results-v1",
          path: "evals/v2/fixtures/search/results.json",
          contentDigest: FIXED_DIGEST,
        },
        reason: "Search is outside the Agent policy system under test",
      },
    ],
    liveDependencies: [
      {
        bindingId: "model-scripted",
        component: "model" as const,
        implementation: contentIdentity("scripted-model"),
        reason: "Scripted provider exercises the live Agent control plane",
      },
    ],
    clock: { bindingId: "clock", mode: "frozen" as const, version: "1", contentDigest: FIXED_DIGEST },
    idGenerator: { bindingId: "ids", mode: "deterministic" as const, version: "1", contentDigest: FIXED_DIGEST },
    timer: { bindingId: "timer", mode: "controlled" as const, version: "1", contentDigest: FIXED_DIGEST },
    budgets: { maximumSteps: 8, maximumToolCalls: 4, maximumDurationMs: 10_000, maximumRetries: 1 },
    reporters: [
      {
        reporterId: "local-json",
        version: "1",
        destination: "local" as const,
        contentDigest: FIXED_DIGEST,
        required: true,
      },
    ],
  };
  return { ...withoutDigest, contentDigest: digestCanonicalJson(withoutDigest) };
}

function makeAttempt(scenario = makeScenario(), profile = makeProfile()): EvaluationAttemptV1 {
  const scenarioRef = {
    identityId: scenario.scenarioId,
    version: scenario.revision,
    contentDigest: scenario.contentDigest,
  };
  const profileRef = {
    identityId: profile.profileId,
    version: profile.version,
    contentDigest: profile.contentDigest,
  };
  const agentDefinition = {
    definitionId: "candidate-momentum-agent",
    version: "1",
    contentDigest: FIXED_DIGEST,
  };
  const attemptId = createEvaluationAttemptId({ scenario: scenarioRef, profile: profileRef, agentDefinition, trialNumber: 1 });
  const withoutDigest = {
    schemaVersion: "evaluation-attempt.v1" as const,
    attemptId,
    scenario: scenarioRef,
    profile: profileRef,
    agentDefinition,
    trialNumber: 1,
    gitSha: "abcdef1234567890",
    systemUnderTest: profile.systemUnderTest,
    frozenDependencies: profile.frozenDependencies,
    fingerprints: {
      provider: contentIdentity("provider"),
      model: contentIdentity("model"),
      prompt: contentIdentity("prompt"),
      policy: contentIdentity("policy"),
      toolManifest: contentIdentity("tools"),
      sdk: contentIdentity("sdk"),
      rubric: contentIdentity("rubric"),
      exportPolicy: contentIdentity("export-policy"),
      context: contentIdentity("context"),
    },
    startedAt: FIXED_TIME,
  };
  return { ...withoutDigest, contentDigest: digestCanonicalJson(withoutDigest) };
}

function makeScore(
  scenario = makeScenario(),
  attempt = makeAttempt(scenario),
  overrides: Partial<EvaluationScoreV1> = {},
): EvaluationScoreV1 {
  return {
    schemaVersion: "evaluation-score.v1",
    scoreId: "score-identity",
    scenarioId: scenario.scenarioId,
    attemptId: attempt.attemptId,
    capability: "identity",
    criterionId: "identity-abstains",
    evaluatorId: "identity-oracle",
    evaluatorVersion: "1",
    evaluatorKind: "deterministic",
    riskTier: "p0_blocker",
    status: "pass",
    gateAuthority: true,
    veto: false,
    evidence: [{ artifactId: "agent-terminal", jsonPointer: "/terminal/status" }],
    ...overrides,
  };
}

describe("canonical content identity", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 }, values: [2, 1] })).toBe(
      '{"a":{"b":1,"d":2},"values":[2,1],"z":1}',
    );
    expect(digestCanonicalJson({ b: 2, a: 1 })).toBe(digestCanonicalJson({ a: 1, b: 2 }));
  });

  it("rejects values that are not truthful JSON", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ value: undefined })).toThrow(CanonicalJsonError);
  });
});

describe("Scenario contracts and oracle isolation", () => {
  it("validates a content-addressed ref-based Scenario", () => {
    expect(validateScenarioDocument(makeScenario())).toEqual({ valid: true, issues: [] });
  });

  it("requires P0/P1 forbidden outcomes after materialization", () => {
    const scenario = makeScenario();
    const materials = makeScenarioMaterials();
    materials.oracle.forbidden = [];
    scenario.oracleRef.contentDigest = digestCanonicalJson(materials.oracle);
    scenario.contentDigest = digestContentDocument(scenario);
    const result = validateMaterializedScenario({ ...scenario, ...materials });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("scenario.forbidden_required");
  });

  it("rejects oracle keys and exact oracle values in model-visible input", () => {
    const scenario = makeScenario();
    const materials = makeScenarioMaterials();
    (materials.input as Record<string, unknown>).task = {
      expectedAnswer: "The system must never bind an ambiguous source to a Person",
    };
    scenario.modelInputRef.contentDigest = digestCanonicalJson(materials.modelInputFixture);
    scenario.contentDigest = digestContentDocument(scenario);
    const result = validateMaterializedScenario({ ...scenario, ...materials });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["scenario.oracle_key_leak", "scenario.oracle_value_leak"]),
    );
  });

  it("builds model input with a resolver that has no oracle capability", async () => {
    const scenario = makeScenario();
    const { input } = makeScenarioMaterials();
    let reads = 0;
    const result = await buildModelVisibleInput(scenario, {
      readModelInput: async (ref) => {
        reads += 1;
        expect(ref.fixtureId).toBe("model-input-TS-ID-103");
        return makeScenarioMaterials().modelInputFixture;
      },
    });
    expect(result).toEqual(input);
    expect(reads).toBe(1);
  });

  it("materializes separate refs and validates their digests", async () => {
    const scenario = makeScenario();
    const materials = makeScenarioMaterials();
    const result = await materializeScenario(scenario, {
      readModelInput: async () => materials.modelInputFixture,
      readInitialState: async () => materials.initialStateFixture,
      readOracle: async () => materials.oracle,
    });
    expect(result.oracle.terminal.status).toBe("abstain");
  });

  it("rejects a P0 model evaluator with gate authority", () => {
    const scenario = makeScenario();
    scenario.evaluatorBindings = [{
      ...scenario.evaluatorBindings[0]!,
      evaluatorId: "self-judge",
      kind: "model",
      requiredForGate: true,
    }];
    scenario.contentDigest = digestContentDocument(scenario);
    expect(validateScenarioDocument(scenario).issues.map((issue) => issue.code)).toContain("scenario.model_gate_authority");
  });

  it("keeps human gold atomic and derives mixed Scenario adjudication without upgrading it", async () => {
    const scenario = makeScenario();
    const materials = makeScenarioMaterials();
    const materialized = await materializeScenario(scenario, {
      readModelInput: async () => materials.modelInputFixture,
      readInitialState: async () => materials.initialStateFixture,
      readOracle: async () => materials.oracle,
    });
    const criteria = collectAdjudicableCriterionIds(materialized.oracle, materialized.evaluatorBindings);
    const oneReviewed = [{
      criterionId: criteria[0]!,
      status: "human_gold" as const,
      evidence: [{ artifactId: "review-artifact", jsonPointer: "/criteria/0" }],
      reviewerId: "reviewer-01",
      decisionId: "decision-01",
      decidedAt: FIXED_TIME,
    }];
    expect(deriveScenarioAdjudication(oneReviewed, criteria)).toBe("unreviewed");
    const mixed = {
      ...materialized,
      adjudication: "unreviewed" as const,
      criterionAdjudications: oneReviewed,
    };
    mixed.contentDigest = digestCanonicalJson(
      Object.fromEntries(Object.entries(mixed).filter(([key]) =>
        !["contentDigest", "input", "initialState", "oracle"].includes(key))),
    );
    expect(validateMaterializedScenario(mixed)).toEqual({ valid: true, issues: [] });

    const falselyUpgraded = {
      ...mixed,
      adjudication: "human_gold" as const,
    };
    falselyUpgraded.contentDigest = digestCanonicalJson(
      Object.fromEntries(Object.entries(falselyUpgraded).filter(([key]) =>
        !["contentDigest", "input", "initialState", "oracle"].includes(key))),
    );
    expect(validateMaterializedScenario(falselyUpgraded).issues.map((issue) => issue.code)).toContain(
      "adjudication.summary_mismatch",
    );
    expect(digestCriterionAdjudications(oneReviewed)).toBe(digestCanonicalJson(oneReviewed));
  });

  it("rejects a default Profile that is not explicitly compatible", () => {
    const scenario = makeScenario();
    scenario.slices.defaultProfileId = "identity-replay-v1";
    scenario.contentDigest = digestContentDocument(scenario);
    expect(validateScenarioDocument(scenario).issues.map((issue) => issue.code)).toContain(
      "scenario.default_profile_incompatible",
    );
  });
});

describe("Profile and Attempt experiment validity", () => {
  it("rejects a frozen system under test", () => {
    const profile = makeProfile();
    profile.frozenDependencies = [{
      ...profile.frozenDependencies[0]!,
      component: "agent_policy",
    }];
    profile.contentDigest = digestContentDocument(profile);
    const result = validateProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("profile.system_under_test_frozen");
  });

  it("requires an Attempt to snapshot the exact Profile and stable attempt ID", () => {
    const profile = makeProfile();
    const attempt = makeAttempt(makeScenario(), profile);
    expect(validateAttemptAgainstProfile(attempt, profile)).toEqual({ valid: true, issues: [] });
    attempt.systemUnderTest = ["search"];
    attempt.contentDigest = digestContentDocument(attempt);
    const result = validateAttemptAgainstProfile(attempt, profile);
    expect(result.issues.map((issue) => issue.code)).toContain("attempt.sut_mismatch");
  });
});

describe("partition contamination", () => {
  it("detects cross-partition fixture and semantic reuse deterministically", async () => {
    const scenario = makeScenario();
    const materials = makeScenarioMaterials();
    const materialized = await materializeScenario(scenario, {
      readModelInput: async () => materials.modelInputFixture,
      readInitialState: async () => materials.initialStateFixture,
      readOracle: async () => materials.oracle,
    });
    const duplicate = {
      ...materialized,
      scenarioId: "TS-ID-999",
      partition: "dev" as const,
      contentDigest: FIXED_DIGEST,
      lineage: { sourceKind: "native" as const, sourceIds: ["TS-ID-999"] },
    };
    const findings = scanPartitionContamination([materialized, duplicate]);
    expect(findings.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["fixture_digest_cross_partition", "semantic_near_duplicate"]),
    );
  });
});

describe("veto-first capability gates", () => {
  it("lets one P0 authority failure veto any quality pass", () => {
    const scenario = makeScenario();
    const attempt = makeAttempt(scenario);
    const scores = [
      makeScore(scenario, attempt, { status: "fail", reasonCode: "wrong_person", veto: false }),
      makeScore(scenario, attempt, {
        scoreId: "quality-score",
        evaluatorId: "quality-reviewer",
        evaluatorKind: "human",
        riskTier: "p2_quality",
        status: "pass",
        gateAuthority: false,
        criterionId: "identity-abstains",
      }),
    ];
    const gate = evaluateCapabilityGates(scenario, attempt, scores, FIXED_TIME);
    expect(gate.status).toBe("fail");
    expect(gate.capabilities[0]?.vetoScoreIds).toEqual(["score-identity"]);
    expect(gate.contentDigest).toBe(digestContentDocument(gate));
  });

  it("refuses to give a model evaluator P0 authority", () => {
    const scenario = makeScenario();
    const attempt = makeAttempt(scenario);
    expect(() => evaluateCapabilityGates(scenario, attempt, [makeScore(scenario, attempt, {
      evaluatorKind: "model",
      gateAuthority: true,
    })], FIXED_TIME)).toThrow("cannot own P0");
  });

  it("returns needs_review when a required evaluator is absent", () => {
    const scenario = makeScenario();
    const attempt = makeAttempt(scenario);
    const gate = evaluateCapabilityGates(scenario, attempt, [makeScore(scenario, attempt, {
      evaluatorId: "informational",
      evaluatorVersion: "1",
      evaluatorKind: "model",
      riskTier: "p2_quality",
      gateAuthority: false,
    })], FIXED_TIME);
    expect(gate.status).toBe("needs_review");
    expect(gate.capabilities[0]?.missingEvaluatorIds).toEqual(["identity-oracle"]);
  });

  it("attributes a missing workflow evaluator only to the workflow capability", () => {
    const base = makeScenario();
    const withoutDigest = {
      ...base,
      evaluatorBindings: [
        ...base.evaluatorBindings,
        {
          evaluatorId: "human-workflow",
          version: "1",
          contentDigest: FIXED_DIGEST,
          kind: "human" as const,
          criterionIds: ["workflow.useful-next-step", "workflow.correction-burden"],
          requiredForGate: true,
        },
      ],
    };
    const scenario = { ...withoutDigest, contentDigest: digestContentDocument(withoutDigest) };
    const attempt = makeAttempt(scenario);
    const gate = evaluateCapabilityGates(scenario, attempt, [makeScore(scenario, attempt)], FIXED_TIME);

    expect(gate.status).toBe("needs_review");
    expect(gate.capabilities.find((item) => item.capability === "identity")).toMatchObject({
      status: "pass",
      missingEvaluatorIds: [],
    });
    expect(gate.capabilities.find((item) => item.capability === "workflow")).toMatchObject({
      status: "needs_review",
      missingEvaluatorIds: ["human-workflow"],
      scoreIds: [],
    });
  });
});

describe("registry and legacy adaptation", () => {
  it("preserves immutable revisions and validates suite axes", () => {
    const scenario = makeScenario();
    const suiteWithoutDigest = {
      schemaVersion: "evaluation-suite.v1" as const,
      suiteId: "p0-identity",
      version: "1",
      title: "P0 identity",
      purpose: "Release blocking identity cases",
      scenarios: [{
        scenarioId: scenario.scenarioId,
        revision: scenario.revision,
        contentDigest: scenario.contentDigest,
        lifecycle: scenario.lifecycle,
        adjudication: scenario.adjudication,
        criterionAdjudicationDigest: digestCanonicalJson(scenario.criterionAdjudications),
        partition: scenario.partition,
        dataClass: scenario.dataPolicy.dataClass,
      }],
      lineage: { sourceKind: "native" as const, sourceIds: ["p0-identity"] },
    };
    const suite: EvaluationSuiteV1 = {
      ...suiteWithoutDigest,
      contentDigest: digestCanonicalJson(suiteWithoutDigest),
    };
    expect(validateSuite(suite)).toEqual({ valid: true, issues: [] });
    const registry = new EvaluationRegistry();
    registry.registerScenario(scenario);
    registry.registerProfile(makeProfile());
    registry.registerSuite(suite);
    expect(registry.validateIntegrity()).toEqual([]);
    expect(registry.listScenarios({ partition: "p0" })).toHaveLength(1);

    const changed = { ...scenario, title: "Changed without revision", contentDigest: FIXED_DIGEST };
    changed.contentDigest = digestContentDocument(changed);
    expect(() => registry.registerScenario(changed)).toThrow("immutable");
  });

  it("adapts eight legacy records through exactly one explicit adapter", async () => {
    const template = makeScenario();
    const legacy = Array.from({ length: 8 }, (_, index) => ({ legacyId: `legacy-${index + 1}` }));
    const adapted = await adaptLegacyScenarios(legacy, [{
      adapterId: "candidate-momentum-v1",
      version: "1",
      canAdapt: (value: unknown): value is { legacyId: string } =>
        typeof value === "object" && value !== null && "legacyId" in value,
      adapt: (value) => {
        const withoutDigest = {
          ...template,
          scenarioId: value.legacyId,
          lineage: {
            sourceKind: "legacy_adapter" as const,
            sourceIds: [value.legacyId, "candidate-momentum-v1@1"],
          },
        };
        return { ...withoutDigest, contentDigest: digestContentDocument(withoutDigest) };
      },
    }]);
    expect(adapted).toHaveLength(8);
    expect(new Set(adapted.map((scenario) => scenario.scenarioId)).size).toBe(8);
  });
});

describe("deterministic runtime dependencies", () => {
  it("replays clock, IDs, timer order, cancellation, and sleep without wall time", async () => {
    const runtime = createDeterministicRuntimeDependencies(Date.parse(FIXED_TIME), 1);
    expect(runtime.ids.nextId("attempt")).toBe("attempt_00000001");
    const events: string[] = [];
    runtime.timer.schedule(10, () => { events.push("later"); });
    const cancelled = runtime.timer.schedule(5, () => { events.push("cancelled"); });
    runtime.timer.schedule(5, () => { events.push("first"); });
    expect(runtime.timer.cancel(cancelled)).toBe(true);
    await runtime.timer.advanceBy(10);
    expect(events).toEqual(["first", "later"]);
    expect(runtime.clock.nowIso()).toBe("2026-09-01T00:00:00.010Z");
  });
});

describe("LocalJsonReporter", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("writes a content-addressed, write-once local Gate Artifact before optional projection", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "talent-signal-evaluation-"));
    temporaryDirectories.push(outputDirectory);
    const scenario = makeScenario();
    const profile = makeProfile();
    const attempt = makeAttempt(scenario, profile);
    const manifestWithoutDigest = {
      schemaVersion: "evaluation-run-manifest.v1" as const,
      runId: "run_TS-ID-103_1",
      suite: contentIdentity("p0-identity"),
      attempt,
      profile,
      createdAt: FIXED_TIME,
    };
    const manifest: EvaluationRunManifestV1 = {
      ...manifestWithoutDigest,
      contentDigest: digestCanonicalJson(manifestWithoutDigest),
    };
    expect(validateRunManifest(manifest)).toEqual({ valid: true, issues: [] });
    const runtime = createDeterministicRuntimeDependencies(Date.parse(FIXED_TIME));
    const reporter = new LocalJsonReporter({ outputDirectory, runtime });
    const runRef = await reporter.beginRun(manifest);
    expect(runRef.artifactRef).toBe("local-evaluation-run:run_TS-ID-103_1");
    const manifestPath = path.join(outputDirectory, "runs", manifest.runId, "manifest.json");
    expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(manifest);

    await reporter.recordTrace({
      schemaVersion: "safe-evaluation-trace.v1",
      traceId: "trace_1",
      attemptId: attempt.attemptId,
      ordinal: 0,
      eventKind: "terminal",
      status: "completed",
      outputDigest: FIXED_DIGEST,
    });
    const score = makeScore(scenario, attempt);
    await reporter.recordScores([score]);
    const gate = evaluateCapabilityGates(scenario, attempt, [score], FIXED_TIME);
    const receipt = await reporter.completeRun(gate);
    expect(receipt.status).toBe("succeeded");
    expect(receipt.localArtifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateProjectionReceipt(receipt)).toEqual({ valid: true, issues: [] });
    const resultWithoutDigest = {
      schemaVersion: "evaluation-result.v1" as const,
      resultId: "result_run_TS-ID-103_1",
      attemptId: attempt.attemptId,
      terminalStatus: "completed" as const,
      terminalReasonCode: "oracle_complete",
      gate,
      traceDigest: FIXED_DIGEST,
      startedAt: FIXED_TIME,
      completedAt: FIXED_TIME,
    };
    expect(validateResult({
      ...resultWithoutDigest,
      contentDigest: digestCanonicalJson(resultWithoutDigest),
    })).toEqual({ valid: true, issues: [] });
    await expect(reporter.completeRun(gate)).resolves.toEqual(receipt);

    const deletion = await reporter.deleteProjection({
      reporterId: "local-json",
      runId: manifest.runId,
      projectionId: `local_${manifest.runId}`,
    });
    expect(deletion).toMatchObject({
      status: "deleted",
      deletionScope: "local_projection_tombstone",
      retainedSurfaces: ["immutable_local_authority"],
      readBackVerified: true,
      reasonCode: "projection_tombstoned_local_authority_retained",
    });
    expect(validateDeletionReceipt(deletion)).toEqual({ valid: true, issues: [] });
    await expect(readFile(manifestPath, "utf8")).resolves.toContain(manifest.runId);
  });

  it("rejects a different Manifest reusing an existing runId", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "talent-signal-evaluation-"));
    temporaryDirectories.push(outputDirectory);
    const scenario = makeScenario();
    const profile = makeProfile();
    const attempt = makeAttempt(scenario, profile);
    const base = {
      schemaVersion: "evaluation-run-manifest.v1" as const,
      runId: "run_collision",
      suite: contentIdentity("p0-identity"),
      attempt,
      profile,
      createdAt: FIXED_TIME,
    };
    const first = { ...base, contentDigest: digestCanonicalJson(base) };
    await new LocalJsonReporter({ outputDirectory }).beginRun(first);
    const changedBase = { ...base, createdAt: "2026-09-01T00:00:01.000Z" };
    const changed = { ...changedBase, contentDigest: digestCanonicalJson(changedBase) };
    await expect(new LocalJsonReporter({ outputDirectory }).beginRun(changed)).rejects.toThrow("different content");
  });
});
