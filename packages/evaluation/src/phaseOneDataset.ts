import type { DatasetPartition, JsonValue, Sha256Digest } from "./contracts.js";
import { contentDigestMatches, digestCanonicalJson, hasValidSha256Format, withContentDigest } from "./digest.js";

/** All identifiers in exported artifacts are opaque; input and gold stay local. */
export interface PhaseOneCase {
  caseId: string;
  sourceIds: string[];
  sourcePartition: DatasetPartition;
  purpose: "development" | "final_verification";
  referenceTime: string;
  modelInput: JsonValue;
  oracle: JsonValue;
  slices: Record<string, string>;
}

export interface PhaseOneExposure {
  sourceIds: string[];
  actorId: string;
  role: "generator" | "developer" | "independent_executor" | "judge" | "release_reviewer";
  content: "input" | "gold" | "failure_details";
  observedAt: string;
}

export interface PhaseOneDataset {
  schemaVersion: "phase-one-dataset.v1";
  datasetId: string;
  cases: Array<Omit<PhaseOneCase, "modelInput" | "oracle"> & {
    inputDigest: Sha256Digest;
    oracleDigest: Sha256Digest;
    currentPurpose: PhaseOneCase["purpose"];
  }>;
  exposureDigest: Sha256Digest;
  contentDigest: Sha256Digest;
}

export function phaseOneAssert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export function phaseOneId(value: unknown): asserts value is string {
  phaseOneAssert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/.test(value), "PHASE_ONE_OPAQUE_ID_REQUIRED");
}

export function phaseOneTime(value: string): number {
  const result = Date.parse(value);
  phaseOneAssert(Number.isFinite(result), "PHASE_ONE_TIME_INVALID");
  return result;
}

/** Clone before freezing: caller-owned references cannot mutate a frozen run. */
export function phaseOneFreeze<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(copy);
  return copy;
}

export function assertPhaseOneDigest(value: { contentDigest: Sha256Digest }): void {
  phaseOneAssert(hasValidSha256Format(value.contentDigest) && contentDigestMatches(value), "PHASE_ONE_CONTENT_DIGEST_MISMATCH");
}

export function phaseOneExposureDigest(exposures: readonly PhaseOneExposure[]): Sha256Digest {
  for (const event of exposures) {
    phaseOneId(event.actorId);
    phaseOneAssert(["generator", "developer", "independent_executor", "judge", "release_reviewer"].includes(event.role)
      && ["input", "gold", "failure_details"].includes(event.content), "PHASE_ONE_EXPOSURE_INVALID");
    phaseOneTime(event.observedAt);
    phaseOneAssert(event.sourceIds.length > 0, "PHASE_ONE_EXPOSURE_SOURCE_REQUIRED");
    event.sourceIds.forEach(phaseOneId);
  }
  return digestCanonicalJson(exposures);
}

/**
 * Split by source group, not by individual messages. A viewed holdout retains
 * its original partition in provenance but can only serve development now.
 */
export function freezePhaseOneDataset(input: {
  datasetId: string;
  cases: readonly PhaseOneCase[];
  exposures: readonly PhaseOneExposure[];
}): PhaseOneDataset {
  phaseOneId(input.datasetId);
  phaseOneAssert(input.cases.length > 0, "PHASE_ONE_DATASET_EMPTY");
  const seenCases = new Set<string>();
  const groups = new Map<string, DatasetPartition>();
  const inputGroups = new Map<Sha256Digest, DatasetPartition>();
  const exposed = new Set(input.exposures.filter((item) => ["generator", "developer"].includes(item.role)).flatMap((item) => item.sourceIds));
  const exposureDigest = phaseOneExposureDigest(input.exposures);
  const cases = input.cases.map((item) => {
    phaseOneId(item.caseId);
    phaseOneAssert(!seenCases.has(item.caseId), "PHASE_ONE_CASE_DUPLICATE");
    seenCases.add(item.caseId);
    phaseOneAssert(["p0", "dev", "held_out", "red_team"].includes(item.sourcePartition), "PHASE_ONE_PARTITION_INVALID");
    phaseOneAssert(["development", "final_verification"].includes(item.purpose), "PHASE_ONE_PURPOSE_INVALID");
    phaseOneAssert(item.sourceIds.length > 0, "PHASE_ONE_SOURCE_REQUIRED");
    phaseOneTime(item.referenceTime);
    for (const source of item.sourceIds) {
      phaseOneId(source);
      phaseOneAssert(!groups.has(source) || groups.get(source) === item.sourcePartition, "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
      groups.set(source, item.sourcePartition);
    }
    for (const [key, value] of Object.entries(item.slices)) { phaseOneId(key); phaseOneId(value); }
    const inputDigest = digestCanonicalJson(item.modelInput);
    phaseOneAssert(!inputGroups.has(inputDigest) || inputGroups.get(inputDigest) === item.sourcePartition, "PHASE_ONE_INPUT_PARTITION_CONTAMINATION");
    inputGroups.set(inputDigest, item.sourcePartition);
    const currentPurpose = item.sourcePartition === "dev" || item.sourceIds.some((source) => exposed.has(source)) ? "development" : item.purpose;
    return { caseId: item.caseId, sourceIds: [...new Set(item.sourceIds)].sort(), sourcePartition: item.sourcePartition,
      purpose: item.purpose, currentPurpose, referenceTime: item.referenceTime, slices: item.slices,
      inputDigest, oracleDigest: digestCanonicalJson(item.oracle) };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  return phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-dataset.v1" as const, datasetId: input.datasetId, cases, exposureDigest }));
}

export function assertPhaseOneDatasetCurrent(dataset: PhaseOneDataset, cases: readonly PhaseOneCase[], exposures: readonly PhaseOneExposure[]): void {
  assertPhaseOneDigest(dataset);
  const current = freezePhaseOneDataset({ datasetId: dataset.datasetId, cases, exposures });
  phaseOneAssert(current.contentDigest === dataset.contentDigest, "PHASE_ONE_DATASET_OR_EXPOSURE_STALE");
}

/** Deliberately omits oracle, heldout inputs, gold labels and failure details. */
export function phaseOneGeneratorInputs(cases: readonly PhaseOneCase[]): Array<Pick<PhaseOneCase, "caseId" | "modelInput" | "referenceTime">> {
  return phaseOneFreeze(cases.filter((item) => item.sourcePartition === "dev" && item.purpose === "development")
    .map(({ caseId, modelInput, referenceTime }) => ({ caseId, modelInput, referenceTime })));
}
