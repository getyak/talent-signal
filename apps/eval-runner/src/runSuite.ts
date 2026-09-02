import {
  createEvaluationAttemptId,
  createSystemRuntimeDependencies,
  digestCanonicalJson,
  digestContentDocument,
  evaluateCapabilityGates,
  type AgentDefinitionReferenceV1,
  type AttemptFingerprintsV1,
  type ContentIdentityV1,
  type EvaluationAttemptV1,
  type EvaluationExecutionProfileV1,
  type EvaluationReporter,
  type EvaluationResultV1,
  type EvaluationRunManifestV1,
  type EvaluationRuntimeDependencies,
  type EvaluationScenarioV1,
  type EvaluationSuiteV1,
  type ProjectionReceiptV1,
} from "@talent-signal/evaluation";

import type {
  DeterministicEvaluator,
  EvaluationAttemptOutcomeV1,
  ModeExecutionObservationV1,
} from "./contracts.js";
import {
  BoundaryDeterministicEvaluator,
  OutcomeIntegrityEvaluator,
} from "./deterministicEvaluator.js";
import {
  buildModeExecutionInput,
  InvalidExperimentError,
  ModeDispatcher,
  validateProfileCompatibility,
  validateSystemUnderTest,
} from "./modeDispatch.js";
import { emptyReviewBoundary } from "./reviewBoundary.js";
import { SAFE_EXPORT_POLICY_VERSION } from "./safeExportPolicy.js";

export interface RunEvaluationCaseInputV1 {
  scenario: EvaluationScenarioV1;
  profile: EvaluationExecutionProfileV1;
  suite: EvaluationSuiteV1;
  dispatcher: ModeDispatcher;
  localReporter: EvaluationReporter;
  projectionReporters?: readonly EvaluationReporter[];
  evaluators?: readonly DeterministicEvaluator[];
  runtime?: EvaluationRuntimeDependencies;
  trialNumber?: number;
  gitSha: string;
  agentDefinition?: AgentDefinitionReferenceV1;
  fingerprints?: Partial<AttemptFingerprintsV1>;
}

export interface RunEvaluationCaseOutputV1 extends EvaluationAttemptOutcomeV1 {
  manifest: EvaluationRunManifestV1;
  localReceipt: ProjectionReceiptV1;
  projectionErrors: Array<{ reporterId: string; reasonCode: string }>;
}

function identity(identityId: string, version: string, seed: unknown): ContentIdentityV1 {
  return { identityId, version, contentDigest: digestCanonicalJson(seed) };
}

function defaultFingerprints(
  scenario: EvaluationScenarioV1,
  profile: EvaluationExecutionProfileV1,
): AttemptFingerprintsV1 {
  return {
    provider: identity("provider", "unconfigured", { mode: profile.mode }),
    model: identity("model", "unconfigured", { mode: profile.mode }),
    prompt: identity("prompt", scenario.revision, scenario.input),
    policy: identity("policy", "evaluation.v1", { systemUnderTest: profile.systemUnderTest }),
    toolManifest: identity("tool-manifest", profile.version, {
      frozenDependencies: profile.frozenDependencies,
      budgets: profile.budgets,
    }),
    sdk: identity("evaluation-sdk", "0.1.0", { package: "@talent-signal/evaluation" }),
    rubric: identity("rubric", scenario.revision, scenario.evaluatorBindings),
    exportPolicy: identity("export-policy", SAFE_EXPORT_POLICY_VERSION, {
      version: SAFE_EXPORT_POLICY_VERSION,
    }),
    context: identity("context", scenario.revision, {
      modelInputDigest: scenario.modelInputRef.contentDigest,
      initialStateDigest: scenario.initialStateRef.contentDigest,
    }),
  };
}

function mergeFingerprints(
  defaults: AttemptFingerprintsV1,
  supplied: Partial<AttemptFingerprintsV1> | undefined,
): AttemptFingerprintsV1 {
  return { ...defaults, ...supplied };
}

function buildAttempt(input: RunEvaluationCaseInputV1, runtime: EvaluationRuntimeDependencies) {
  const trialNumber = input.trialNumber ?? 1;
  const scenarioRef = identity(
    input.scenario.scenarioId,
    input.scenario.revision,
    input.scenario,
  );
  scenarioRef.contentDigest = input.scenario.contentDigest;
  const profileRef = identity(input.profile.profileId, input.profile.version, input.profile);
  profileRef.contentDigest = input.profile.contentDigest;
  const agentDefinition =
    input.agentDefinition ??
    {
      definitionId: "evaluation-runner-unconfigured",
      version: "0.1.0",
      contentDigest: digestCanonicalJson({ definition: "evaluation-runner-unconfigured" }),
    };
  const attemptId = createEvaluationAttemptId({
    scenario: scenarioRef,
    profile: profileRef,
    agentDefinition,
    trialNumber,
  });
  const partial = {
    schemaVersion: "evaluation-attempt.v1" as const,
    attemptId,
    scenario: scenarioRef,
    profile: profileRef,
    agentDefinition,
    trialNumber,
    gitSha: input.gitSha,
    systemUnderTest: [...input.profile.systemUnderTest],
    frozenDependencies: [...input.profile.frozenDependencies],
    fingerprints: mergeFingerprints(
      defaultFingerprints(input.scenario, input.profile),
      input.fingerprints,
    ),
    startedAt: runtime.clock.nowIso(),
  };
  return { ...partial, contentDigest: digestContentDocument(partial) } satisfies EvaluationAttemptV1;
}

function invalidObservation(
  attempt: EvaluationAttemptV1,
  profile: EvaluationExecutionProfileV1,
  error: InvalidExperimentError,
  now: string,
): ModeExecutionObservationV1 {
  return {
    schemaVersion: "evaluation-mode-observation.v1",
    mode: profile.mode,
    terminalStatus: "not_run",
    terminalReasonCode: error.reasonCode,
    outcomeStatus: "blocked",
    output: { run: { status: "not_run", reasonCode: error.reasonCode } },
    reviewBoundary: emptyReviewBoundary(),
    trace: [],
    criteria: [
      {
        criterionId: "valid-system-under-test",
        status: "fail",
        reasonCode: error.reasonCode,
        evidenceLocator: "profile.systemUnderTest",
      },
    ],
    violations: [
      {
        category: "invalid_experiment",
        reasonCode: error.reasonCode,
        evidenceLocator: "profile.frozenDependencies",
      },
    ],
    outputDigest: digestCanonicalJson({ attemptId: attempt.attemptId, reasonCode: error.reasonCode }),
    startedAt: now,
    completedAt: now,
  };
}

function buildResult(input: {
  attempt: EvaluationAttemptV1;
  observation: ModeExecutionObservationV1;
  gate: ReturnType<typeof evaluateCapabilityGates>;
}): EvaluationResultV1 {
  const partial = {
    schemaVersion: "evaluation-result.v1" as const,
    resultId: `result_${digestCanonicalJson({ attemptId: input.attempt.attemptId, gate: input.gate.contentDigest }).slice(7, 39)}`,
    attemptId: input.attempt.attemptId,
    terminalStatus: input.observation.terminalStatus,
    terminalReasonCode: input.observation.terminalReasonCode,
    gate: input.gate,
    traceDigest: digestCanonicalJson(input.observation.trace),
    startedAt: input.observation.startedAt,
    completedAt: input.observation.completedAt,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

export async function runEvaluationCase(
  input: RunEvaluationCaseInputV1,
): Promise<RunEvaluationCaseOutputV1> {
  validateProfileCompatibility(input.scenario, input.profile);
  validateSystemUnderTest(input.profile);
  const runtime = input.runtime ?? createSystemRuntimeDependencies();
  const attempt = buildAttempt(input, runtime);
  const manifestPartial = {
    schemaVersion: "evaluation-run-manifest.v1" as const,
    runId: `evaluation_run_${digestCanonicalJson({
      attemptDigest: attempt.contentDigest,
      suiteDigest: input.suite.contentDigest,
    }).slice(7, 39)}`,
    suite: {
      identityId: input.suite.suiteId,
      version: input.suite.version,
      contentDigest: input.suite.contentDigest,
    },
    attempt,
    profile: input.profile,
    createdAt: runtime.clock.nowIso(),
  };
  const manifest: EvaluationRunManifestV1 = {
    ...manifestPartial,
    contentDigest: digestContentDocument(manifestPartial),
  };

  // Local manifest persistence is the first side effect and is mandatory.
  await input.localReporter.beginRun(manifest);

  let observation: ModeExecutionObservationV1;
  try {
    const modeInput = buildModeExecutionInput({
      scenario: input.scenario,
      profile: input.profile,
      attempt,
    });
    observation = await input.dispatcher.execute(modeInput);
  } catch (error) {
    if (!(error instanceof InvalidExperimentError)) throw error;
    observation = invalidObservation(attempt, input.profile, error, runtime.clock.nowIso());
  }

  const evaluators = [
    new BoundaryDeterministicEvaluator(),
    new OutcomeIntegrityEvaluator(),
    ...(input.evaluators ?? []),
  ];
  const scores = evaluators.flatMap((evaluator) =>
    evaluator.evaluate({ attempt, profile: input.profile, scenario: input.scenario, observation }),
  );
  const gate = evaluateCapabilityGates(
    input.scenario,
    attempt,
    scores,
    runtime.clock.nowIso(),
  );

  for (const trace of observation.trace) await input.localReporter.recordTrace(trace);
  await input.localReporter.recordScores(scores);
  const localReceipt = await input.localReporter.completeRun(gate);

  const projectionReceipts: ProjectionReceiptV1[] = [];
  const projectionErrors: Array<{ reporterId: string; reasonCode: string }> = [];
  for (const reporter of input.projectionReporters ?? []) {
    const reporterId = reporter.constructor.name;
    try {
      if ("setLocalArtifactDigest" in reporter && typeof reporter.setLocalArtifactDigest === "function") {
        reporter.setLocalArtifactDigest(localReceipt.localArtifactDigest);
      }
      await reporter.beginRun(manifest);
      if ("setTerminal" in reporter && typeof reporter.setTerminal === "function") {
        reporter.setTerminal({
          status: observation.terminalStatus,
          reasonCode: observation.terminalReasonCode,
        });
      }
      for (const trace of observation.trace) await reporter.recordTrace(trace);
      await reporter.recordScores(scores);
      projectionReceipts.push(await reporter.completeRun(gate));
    } catch {
      projectionErrors.push({ reporterId, reasonCode: "PROJECTION_REPORTER_FAILED" });
    }
  }

  const result = buildResult({ attempt, observation, gate });
  return {
    manifest,
    manifestDigest: manifest.contentDigest,
    result,
    gate,
    observation,
    localReceipt,
    projectionReceipts,
    projectionErrors,
  };
}

export async function runSuite(input: {
  suite: EvaluationSuiteV1;
  scenarios: readonly EvaluationScenarioV1[];
  profile: EvaluationExecutionProfileV1;
  dispatcher: ModeDispatcher;
  createLocalReporter(scenario: EvaluationScenarioV1): EvaluationReporter;
  createProjectionReporters?(scenario: EvaluationScenarioV1): readonly EvaluationReporter[];
  evaluators?: readonly DeterministicEvaluator[];
  runtime?: EvaluationRuntimeDependencies;
  gitSha: string;
}): Promise<RunEvaluationCaseOutputV1[]> {
  const registrations = new Set(
    input.suite.scenarios.map((item) => `${item.scenarioId}@${item.revision}`),
  );
  const selected = input.scenarios.filter((item) =>
    registrations.has(`${item.scenarioId}@${item.revision}`),
  );
  if (selected.length !== registrations.size) {
    throw new Error(`Suite ${input.suite.suiteId} has unresolved Scenario registrations`);
  }
  const results: RunEvaluationCaseOutputV1[] = [];
  for (const scenario of selected) {
    results.push(
      await runEvaluationCase({
        scenario,
        profile: input.profile,
        suite: input.suite,
        dispatcher: input.dispatcher,
        localReporter: input.createLocalReporter(scenario),
        projectionReporters: input.createProjectionReporters?.(scenario) ?? [],
        evaluators: input.evaluators ?? [],
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
        gitSha: input.gitSha,
      }),
    );
  }
  return results;
}
