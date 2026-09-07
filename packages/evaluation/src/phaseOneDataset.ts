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
  // Contamination follows the complete connected source/input group, including
  // aliases and transitive links. A new source ID cannot reseal a viewed input.
  const contaminatedInputs = new Set<Sha256Digest>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of cases) {
      if (!item.sourceIds.some(source => exposed.has(source)) && !contaminatedInputs.has(item.inputDigest)) continue;
      item.currentPurpose = "development";
      if (!contaminatedInputs.has(item.inputDigest)) { contaminatedInputs.add(item.inputDigest); changed = true; }
      for (const source of item.sourceIds) if (!exposed.has(source)) { exposed.add(source); changed = true; }
    }
  }
  return phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-dataset.v1" as const, datasetId: input.datasetId, cases, exposureDigest }));
}

export function assertPhaseOneDatasetCurrent(dataset: PhaseOneDataset, cases: readonly PhaseOneCase[], exposures: readonly PhaseOneExposure[]): void {
  assertPhaseOneDigest(dataset);
  const current = freezePhaseOneDataset({ datasetId: dataset.datasetId, cases, exposures });
  phaseOneAssert(current.contentDigest === dataset.contentDigest, "PHASE_ONE_DATASET_OR_EXPOSURE_STALE");
}

/** Deliberately omits oracle, heldout inputs, gold labels and failure details. */
export function phaseOneGeneratorInputs(cases: readonly PhaseOneCase[], lifecycle?: PhaseOneDatasetLifecycle): Array<Pick<PhaseOneCase, "caseId" | "modelInput" | "referenceTime">> {
  const retired = lifecycle ? validatePhaseOneDatasetLifecycle(lifecycle).retirements : {};
  if (lifecycle) phaseOneAssert(digestCanonicalJson(cases) === digestCanonicalJson(lifecycle.cases), "PHASE_ONE_LIFECYCLE_CASES_MISMATCH");
  return phaseOneFreeze(cases.filter((item) => item.purpose === "development" && (item.sourcePartition === "dev" || retired[item.caseId]))
    .map(({ caseId, modelInput, referenceTime }) => ({ caseId, modelInput, referenceTime })));
}

type CaseMetadata = PhaseOneDataset["cases"][number];
export interface PhaseOneRetirementGroup {
  retiredCaseIds: string[];
  exposureEventIds: string[];
  replacementCaseIds: string[];
}
type LifecycleEvent = {
  eventId: string; actorId: string; recordedAt: string;
  priorStudyDigest: Sha256Digest; nextStudyDigest: Sha256Digest;
} & ({ kind: "exposure"; exposure: PhaseOneExposure }
  | { kind: "retire_replace"; groups: PhaseOneRetirementGroup[]; replacements: CaseMetadata[] });

/** Only cases contains private bodies. History records digests and opaque IDs. */
export interface PhaseOneDatasetLifecycle {
  schemaVersion: "phase-one-dataset-lifecycle.v1";
  initialDataset: PhaseOneDataset;
  initialExposures: PhaseOneExposure[];
  cases: PhaseOneCase[];
  exposures: PhaseOneExposure[];
  events: LifecycleEvent[];
  contentDigest: Sha256Digest;
}
export interface PhaseOneDevelopmentProvenance {
  schemaVersion: "phase-one-retired-development.v1";
  lifecycleDigest: Sha256Digest;
  studyDigest: Sha256Digest;
  retirementEventId: string;
  caseDigest: Sha256Digest;
}

function same(left: unknown, right: unknown, code: string): void { phaseOneAssert(digestCanonicalJson(left) === digestCanonicalJson(right), code); }
function exactKeys(value: object, keys: string[]): void {
  phaseOneAssert(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), "PHASE_ONE_LIFECYCLE_UNKNOWN_FIELD");
}
function uniqueIds(ids: readonly string[]): void {
  phaseOneAssert(ids.length > 0 && new Set(ids).size === ids.length, "PHASE_ONE_LIFECYCLE_DUPLICATE_OR_EMPTY_IDS"); ids.forEach(phaseOneId);
}
function groupOf(cases: readonly PhaseOneCase[], id: string): PhaseOneCase[] {
  const first = cases.find(item => item.caseId === id);
  phaseOneAssert(first, "PHASE_ONE_RETIREMENT_CASE_MISSING");
  const selected = new Set([first.caseId]), sources = new Set(first.sourceIds), inputs = new Set([digestCanonicalJson(first.modelInput)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of cases) if (!selected.has(item.caseId) && (item.sourceIds.some(source => sources.has(source)) || inputs.has(digestCanonicalJson(item.modelInput)))) {
      selected.add(item.caseId); item.sourceIds.forEach(source => sources.add(source)); inputs.add(digestCanonicalJson(item.modelInput)); changed = true;
    }
  }
  return cases.filter(item => selected.has(item.caseId));
}

/** Replay from immutable metadata, then compare the complete current document. */
export function validatePhaseOneDatasetLifecycle(document: PhaseOneDatasetLifecycle): {
  dataset: PhaseOneDataset; retirements: Record<string, string>;
} {
  phaseOneAssert(document.schemaVersion === "phase-one-dataset-lifecycle.v1" && Array.isArray(document.events)
    && document.events.length <= 5000 && Array.isArray(document.cases) && document.cases.length <= 500, "PHASE_ONE_LIFECYCLE_INVALID");
  exactKeys(document, ["schemaVersion", "initialDataset", "initialExposures", "cases", "exposures", "events", "contentDigest"]);
  assertPhaseOneDigest(document); assertPhaseOneDigest(document.initialDataset);
  phaseOneAssert(new Set(document.cases.map(item => item.caseId)).size === document.cases.length, "PHASE_ONE_CASE_DUPLICATE");
  const byId = new Map(document.cases.map(item => [item.caseId, item]));
  let cases = document.initialDataset.cases.map(metadata => {
    const item = byId.get(metadata.caseId); phaseOneAssert(item, "PHASE_ONE_LIFECYCLE_CASE_MISSING");
    phaseOneAssert(metadata.sourcePartition === "dev" ? metadata.purpose === "development" : metadata.purpose === "final_verification", "PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
    return { ...item, purpose: metadata.purpose };
  });
  const exposures = [...document.initialExposures];
  const freeze = () => freezePhaseOneDataset({ datasetId: document.initialDataset.datasetId, cases, exposures });
  let dataset = freeze(); same(dataset, document.initialDataset, "PHASE_ONE_LIFECYCLE_INITIAL_MISMATCH");
  const events = new Map<string, LifecycleEvent>(), retirements: Record<string, string> = Object.create(null);
  let time = -Infinity;
  for (const event of document.events) {
    exactKeys(event, ["kind", "eventId", "actorId", "recordedAt", "priorStudyDigest", "nextStudyDigest", ...(event.kind === "exposure" ? ["exposure"] : ["groups", "replacements"])]);
    phaseOneId(event.eventId); phaseOneId(event.actorId);
    phaseOneAssert(!events.has(event.eventId), "PHASE_ONE_LIFECYCLE_EVENT_DUPLICATE");
    const nextTime = phaseOneTime(event.recordedAt); phaseOneAssert(nextTime >= time, "PHASE_ONE_LIFECYCLE_TIME_REVERSED"); time = nextTime;
    phaseOneAssert(event.priorStudyDigest === dataset.contentDigest, "PHASE_ONE_LIFECYCLE_CHAIN_BROKEN");
    if (event.kind === "exposure") {
      exactKeys(event.exposure, ["sourceIds", "actorId", "role", "content", "observedAt"]);
      phaseOneExposureDigest([event.exposure]); uniqueIds(event.exposure.sourceIds);
      phaseOneAssert(phaseOneTime(event.exposure.observedAt) <= time && event.exposure.sourceIds.every(source => cases.some(item => item.sourceIds.includes(source))), "PHASE_ONE_LIFECYCLE_EXPOSURE_UNKNOWN_SOURCE");
      exposures.push(event.exposure);
    } else {
      phaseOneAssert(event.kind === "retire_replace" && event.groups.length > 0 && event.replacements.length > 0, "PHASE_ONE_RETIREMENT_INVALID");
      const retiredIds = event.groups.flatMap(group => group.retiredCaseIds), replacementIds = event.groups.flatMap(group => group.replacementCaseIds);
      uniqueIds(retiredIds); uniqueIds(replacementIds); uniqueIds(event.replacements.map(item => item.caseId));
      same([...replacementIds].sort(), event.replacements.map(item => item.caseId).sort(), "PHASE_ONE_REPLACEMENT_INCOMPLETE");
      const additions = replacementIds.map(id => { const value = byId.get(id); phaseOneAssert(value && !cases.some(item => item.caseId === id), "PHASE_ONE_REPLACEMENT_CASE_INVALID"); return { ...value, purpose: "final_verification" as const }; });
      for (const item of additions) phaseOneAssert(item.sourcePartition !== "dev" && !cases.some(old => old.sourceIds.some(source => item.sourceIds.includes(source))
        || digestCanonicalJson(old.modelInput) === digestCanonicalJson(item.modelInput)), "PHASE_ONE_REPLACEMENT_SOURCE_OR_INPUT_REUSED");
      const addedMetadata = freezePhaseOneDataset({ datasetId: dataset.datasetId, cases: additions, exposures: [] }).cases;
      same(addedMetadata, event.replacements, "PHASE_ONE_REPLACEMENT_CONTENT_CHANGED");
      for (const group of event.groups) {
        exactKeys(group, ["retiredCaseIds", "exposureEventIds", "replacementCaseIds"]);
        uniqueIds(group.retiredCaseIds); uniqueIds(group.replacementCaseIds); uniqueIds(group.exposureEventIds);
        const old = groupOf(cases, group.retiredCaseIds[0]!);
        same(old.map(item => item.caseId).sort(), [...group.retiredCaseIds].sort(), "PHASE_ONE_RETIREMENT_PARTIAL_SOURCE_GROUP");
        phaseOneAssert(old.every(item => item.sourcePartition !== "dev" && item.purpose === "final_verification" && !retirements[item.caseId]), "PHASE_ONE_RETIREMENT_ALREADY_DEVELOPMENT");
        const relevant = [...events.values()].filter(item => item.kind === "exposure" && ["generator", "developer"].includes(item.exposure.role)
          && item.exposure.sourceIds.some(source => old.some(value => value.sourceIds.includes(source)))).map(item => item.eventId).sort();
        same([...group.exposureEventIds].sort(), relevant, "PHASE_ONE_RETIREMENT_EXPOSURE_MISMATCH");
        const fresh = groupOf(additions, group.replacementCaseIds[0]!);
        same(fresh.map(item => item.caseId).sort(), [...group.replacementCaseIds].sort(), "PHASE_ONE_REPLACEMENT_GROUP_MISMATCH");
        phaseOneAssert(fresh.every(item => item.sourcePartition === old[0]!.sourcePartition), "PHASE_ONE_REPLACEMENT_PARTITION_CHANGED");
        for (const item of old) retirements[item.caseId] = event.eventId;
      }
      cases = cases.map(item => retiredIds.includes(item.caseId) ? { ...item, purpose: "development" as const } : item).concat(additions);
    }
    dataset = freeze();
    if (event.kind === "retire_replace") {
      phaseOneAssert(dataset.cases.filter(item => item.purpose === "final_verification").every(item => item.currentPurpose === "final_verification"), "PHASE_ONE_REPLACEMENT_LEAVES_EXPOSED_FINAL");
      phaseOneAssert(["p0", "held_out", "red_team"].every(partition => dataset.cases.some(item => item.sourcePartition === partition && item.purpose === "final_verification")), "PHASE_ONE_RELEASE_PARTITION_COVERAGE_MISSING");
    }
    phaseOneAssert(event.nextStudyDigest === dataset.contentDigest, "PHASE_ONE_LIFECYCLE_CHAIN_BROKEN"); events.set(event.eventId, event);
  }
  same(exposures, document.exposures, "PHASE_ONE_LIFECYCLE_EXPOSURES_MISMATCH");
  same(dataset, freezePhaseOneDataset({ datasetId: dataset.datasetId, cases: document.cases, exposures }), "PHASE_ONE_LIFECYCLE_CASES_MISMATCH");
  return { dataset, retirements };
}

export function createPhaseOneDatasetLifecycle(datasetId: string, cases: readonly PhaseOneCase[], exposures: readonly PhaseOneExposure[]): PhaseOneDatasetLifecycle {
  const document = phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-dataset-lifecycle.v1" as const,
    initialDataset: freezePhaseOneDataset({ datasetId, cases, exposures }), initialExposures: [...exposures], cases: [...cases], exposures: [...exposures], events: [] }));
  validatePhaseOneDatasetLifecycle(document); return document;
}

/** Legacy exposures become a fixed migration anchor; there is one live journal. */
export function readPhaseOneDatasetDocument(datasetId: string, value: unknown, legacyExposures: readonly PhaseOneExposure[]): {
  cases: PhaseOneCase[]; exposures: PhaseOneExposure[]; universe: PhaseOneDataset; lifecycle: PhaseOneDatasetLifecycle | null;
} {
  const lifecycle = Array.isArray(value) ? null : value as PhaseOneDatasetLifecycle;
  const document = lifecycle ?? createPhaseOneDatasetLifecycle(datasetId, value as PhaseOneCase[], legacyExposures);
  const { dataset } = validatePhaseOneDatasetLifecycle(document);
  phaseOneAssert(dataset.datasetId === datasetId, "PHASE_ONE_LIFECYCLE_DATASET_CHANGED");
  same(document.initialExposures, legacyExposures, "PHASE_ONE_LIFECYCLE_ANCHOR_CHANGED");
  return { cases: document.cases, exposures: document.exposures, universe: dataset, lifecycle };
}

export function appendPhaseOneExposure(document: PhaseOneDatasetLifecycle, input: {
  eventId: string; actorId: string; recordedAt: string; exposure: PhaseOneExposure;
}): PhaseOneDatasetLifecycle {
  const { dataset } = validatePhaseOneDatasetLifecycle(document), exposures = [...document.exposures, input.exposure];
  const next = freezePhaseOneDataset({ datasetId: dataset.datasetId, cases: document.cases, exposures });
  const result = phaseOneFreeze(withContentDigest({ ...document, exposures, events: [...document.events, { ...input, kind: "exposure" as const, priorStudyDigest: dataset.contentDigest, nextStudyDigest: next.contentDigest }] }));
  validatePhaseOneDatasetLifecycle(result); return result;
}

export function retireAndReplacePhaseOneCases(document: PhaseOneDatasetLifecycle, input: {
  eventId: string; actorId: string; recordedAt: string; groups: PhaseOneRetirementGroup[]; replacements: PhaseOneCase[];
}): PhaseOneDatasetLifecycle {
  const { dataset } = validatePhaseOneDatasetLifecycle(document), ids = input.groups.flatMap(group => group.retiredCaseIds);
  phaseOneAssert(input.replacements.every(item => item.purpose === "final_verification"), "PHASE_ONE_REPLACEMENT_CASE_INVALID");
  const cases = document.cases.map(item => ids.includes(item.caseId) ? { ...item, purpose: "development" as const } : item).concat(input.replacements);
  const event = { kind: "retire_replace" as const, eventId: input.eventId, actorId: input.actorId, recordedAt: input.recordedAt, groups: input.groups,
    replacements: freezePhaseOneDataset({ datasetId: dataset.datasetId, cases: input.replacements, exposures: [] }).cases,
    priorStudyDigest: dataset.contentDigest, nextStudyDigest: freezePhaseOneDataset({ datasetId: dataset.datasetId, cases, exposures: document.exposures }).contentDigest };
  const result = phaseOneFreeze(withContentDigest({ ...document, cases, events: [...document.events, event] }));
  validatePhaseOneDatasetLifecycle(result); return result;
}

export function phaseOneDevelopmentProvenance(document: PhaseOneDatasetLifecycle, caseId: string): PhaseOneDevelopmentProvenance {
  const { dataset, retirements } = validatePhaseOneDatasetLifecycle(document), item = dataset.cases.find(item => item.caseId === caseId);
  phaseOneAssert(item && retirements[caseId] && item.purpose === "development", "PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
  return phaseOneFreeze({ schemaVersion: "phase-one-retired-development.v1", lifecycleDigest: document.contentDigest,
    studyDigest: dataset.contentDigest, retirementEventId: retirements[caseId]!, caseDigest: digestCanonicalJson(item) });
}

/** Search gets a generic boundary expectation, never the former final gold. */
export const PHASE_ONE_RETIRED_SEARCH_ORACLE = Object.freeze({ allowedKinds: ["answer", "clarification", "question_set"], requiredCitationIds: [] as string[] });

export function assertPhaseOneRetiredDevelopment(document: PhaseOneDatasetLifecycle, value: {
  caseId: string; sourcePartition: string; purpose: string; referenceTime: string; modelInput: unknown; oracle: unknown; developmentProvenance?: PhaseOneDevelopmentProvenance;
}): void {
  same(value.developmentProvenance ?? null, phaseOneDevelopmentProvenance(document, value.caseId), "PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
  const item = document.cases.find(item => item.caseId === value.caseId)!;
  phaseOneAssert(value.sourcePartition === item.sourcePartition && value.purpose === "development" && value.referenceTime === item.referenceTime, "PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
  same(value.modelInput, item.modelInput, "PHASE_ONE_RETIREMENT_INPUT_CHANGED");
  same(value.oracle, PHASE_ONE_RETIRED_SEARCH_ORACLE, "PHASE_ONE_RETIRED_GOLD_FORBIDDEN");
}
