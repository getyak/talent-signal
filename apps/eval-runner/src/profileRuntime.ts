import {
  createDeterministicRuntimeDependencies,
  createSystemRuntimeDependencies,
  digestCanonicalJson,
  type EvaluationExecutionProfileV1,
  type EvaluationRuntimeDependencies,
} from "@talent-signal/evaluation";

import { InvalidExperimentError, type ModeDispatchClock } from "./modeDispatch.js";

export type ProfileRuntimeKind = "deterministic" | "system";

export function profileRuntimeKind(profile: EvaluationExecutionProfileV1): ProfileRuntimeKind {
  const deterministic =
    profile.clock.mode === "frozen" &&
    profile.idGenerator.mode === "deterministic" &&
    profile.timer.mode === "controlled";
  if (deterministic) return "deterministic";

  const system =
    profile.clock.mode === "system" &&
    profile.idGenerator.mode === "system" &&
    profile.timer.mode === "system";
  if (system) return "system";

  throw new InvalidExperimentError(
    "INCOHERENT_PROFILE_RUNTIME_BINDINGS",
    `Profile ${profile.profileId} mixes frozen and system runtime bindings`,
  );
}

export function createRuntimeForProfile(
  profile: EvaluationExecutionProfileV1,
  scenarioDigest: `sha256:${string}`,
): EvaluationRuntimeDependencies {
  if (profileRuntimeKind(profile) === "system") return createSystemRuntimeDependencies();

  const seed = digestCanonicalJson({
    profileDigest: profile.contentDigest,
    scenarioDigest,
    clock: profile.clock,
    idGenerator: profile.idGenerator,
    timer: profile.timer,
  });
  const seedNumber = Number.parseInt(seed.slice(7, 15), 16);
  const yearStart = Date.UTC(2026, 0, 1);
  const startMs = yearStart + (seedNumber % (365 * 24 * 60 * 60 * 1_000));
  const firstId = (seedNumber % 900_000_000) + 1;
  return createDeterministicRuntimeDependencies(startMs, firstId);
}

export function runtimeDispatchClock(runtime: EvaluationRuntimeDependencies): ModeDispatchClock {
  return { now: () => runtime.clock.nowIso() };
}
