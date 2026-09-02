import {
  digestCanonicalJson,
  type EvaluationExecutionMode,
  type EvaluationExecutionProfileV1,
  type EvaluationScenarioV1,
} from "@talent-signal/evaluation";

import type {
  EvaluationModeExecutor,
  ModeExecutionInputV1,
  ModeExecutionObservationV1,
} from "./contracts.js";

const ORACLE_KEY = /^(?:oracle|forbidden|expected|expectedOutput|groundTruth|gold)$/i;

export class InvalidExperimentError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = "InvalidExperimentError";
    this.reasonCode = reasonCode;
  }
}

export interface ModeDispatchClock {
  now(): string;
}

const SYSTEM_CLOCK: ModeDispatchClock = { now: () => new Date().toISOString() };

export function validateSystemUnderTest(profile: EvaluationExecutionProfileV1): void {
  if (profile.systemUnderTest.length === 0) {
    throw new InvalidExperimentError("SYSTEM_UNDER_TEST_MISSING", "Execution profile has no system under test");
  }
  const tested = new Set(profile.systemUnderTest);
  const invalid = profile.frozenDependencies.filter((binding) => tested.has(binding.component));
  if (invalid.length > 0) {
    throw new InvalidExperimentError(
      "SYSTEM_UNDER_TEST_REPLACED_BY_FIXTURE",
      `Frozen fixture replaced tested component(s): ${invalid.map((item) => item.component).join(", ")}`,
    );
  }
  if (profile.mode === "integration_probe") {
    const live = new Set(profile.liveDependencies.map((binding) => binding.component));
    if (!profile.systemUnderTest.some((component) => live.has(component))) {
      throw new InvalidExperimentError(
        "INTEGRATION_PROBE_HAS_NO_LIVE_SUT",
        "Integration probe must exercise at least one live system-under-test component",
      );
    }
  }
}

export function validateProfileCompatibility(
  scenario: EvaluationScenarioV1,
  profile: EvaluationExecutionProfileV1,
): void {
  if (!scenario.compatibleProfileIds.includes(profile.profileId)) {
    throw new InvalidExperimentError(
      "SCENARIO_PROFILE_INCOMPATIBLE",
      `Scenario ${scenario.scenarioId} does not admit profile ${profile.profileId}`,
    );
  }
}

export function assertNoOracleLeak(value: unknown): void {
  const visit = (candidate: unknown, path: string): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      if (ORACLE_KEY.test(key)) {
        throw new InvalidExperimentError(
          "EXPECTED_OUTPUT_LEAK",
          `Model-visible execution input contains prohibited key at ${path}/${key}`,
        );
      }
      visit(child, `${path}/${key}`);
    }
  };
  visit(value, "$");
}

export function buildModeExecutionInput(input: {
  scenario: EvaluationScenarioV1;
  profile: EvaluationExecutionProfileV1;
  attempt: ModeExecutionInputV1["attempt"];
}): ModeExecutionInputV1 {
  validateSystemUnderTest(input.profile);
  validateProfileCompatibility(input.scenario, input.profile);
  const executionInput: ModeExecutionInputV1 = {
    schemaVersion: "evaluation-mode-input.v1",
    attempt: input.attempt,
    profile: input.profile,
    scenario: {
      scenarioId: input.scenario.scenarioId,
      revision: input.scenario.revision,
      purpose: input.scenario.purpose,
      dataPolicy: input.scenario.dataPolicy,
      input: input.scenario.input,
      initialState: input.scenario.initialState,
    },
  };
  assertNoOracleLeak(executionInput.scenario.input);
  assertNoOracleLeak(executionInput.scenario.initialState);
  return executionInput;
}

export class MissingModeExecutor implements EvaluationModeExecutor {
  constructor(
    readonly mode: EvaluationExecutionMode,
    private readonly clock: ModeDispatchClock = SYSTEM_CLOCK,
  ) {}

  async execute(input: ModeExecutionInputV1): Promise<ModeExecutionObservationV1> {
    const startedAt = this.clock.now();
    const reasonCode = `NOT_RUN_MISSING_${this.mode.toUpperCase()}_EXECUTOR`;
    return {
      schemaVersion: "evaluation-mode-observation.v1",
      mode: this.mode,
      terminalStatus: "not_run",
      terminalReasonCode: reasonCode,
      outcomeStatus: "blocked",
      output: { run: { status: "not_run", reasonCode } },
      reviewBoundary: {
        schemaVersion: "evaluation-review-boundary.v1",
        evidence: [],
        confirmedState: [],
        interpretations: [],
        proposedActions: [],
        observedOutcomes: [],
      },
      trace: [],
      criteria: [],
      violations: [],
      outputDigest: digestCanonicalJson({
        attemptId: input.attempt.attemptId,
        mode: this.mode,
        reasonCode,
      }),
      startedAt,
      completedAt: this.clock.now(),
    };
  }
}

export class ModeDispatcher {
  private readonly executors = new Map<EvaluationExecutionMode, EvaluationModeExecutor>();

  constructor(executors: readonly EvaluationModeExecutor[] = []) {
    for (const executor of executors) {
      if (this.executors.has(executor.mode)) {
        throw new Error(`Duplicate mode executor: ${executor.mode}`);
      }
      this.executors.set(executor.mode, executor);
    }
  }

  async execute(input: ModeExecutionInputV1): Promise<ModeExecutionObservationV1> {
    validateSystemUnderTest(input.profile);
    const executor = this.executors.get(input.profile.mode) ?? new MissingModeExecutor(input.profile.mode);
    const observation = await executor.execute(input);
    if (observation.mode !== input.profile.mode) {
      throw new InvalidExperimentError(
        "EXECUTOR_MODE_MISMATCH",
        `Executor returned ${observation.mode} for ${input.profile.mode}`,
      );
    }
    return observation;
  }
}
