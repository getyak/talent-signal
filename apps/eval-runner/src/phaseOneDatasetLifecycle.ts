import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { appendPhaseOneExposure, assertPhaseOneRetiredDevelopment, createPhaseOneDatasetLifecycle, digestCanonicalJson,
  PHASE_ONE_RETIRED_SEARCH_ORACLE, phaseOneAssert, phaseOneDevelopmentProvenance, phaseOneTime,
  readPhaseOneDatasetDocument, retireAndReplacePhaseOneCases, type PhaseOneCase, type PhaseOneDatasetLifecycle, type PhaseOneExposure,
  type PhaseOneRetirementGroup } from "@talent-signal/evaluation";
import { controllerBasename, controllerDirectory, writeControllerArtifact } from "./optimization/controllerFiles.js";
import { assertPhaseOnePrivateSources } from "./phaseOneSources.js";
import type { PhaseOneController } from "./phaseOneCommand.js";
import type { OptimizationFeedbackBinding } from "./optimization/feedbackSource.js";
import { optimizationConfiguration, validateOptimizationRelationshipInput, type OptimizationDevExample } from "./optimization/productTask.js";
import { assertOptimizationLifecycleCurrent } from "./optimization/lifecycle.js";

export function readPhaseOneControllerDataset(config: Pick<PhaseOneController, "datasetId" | "casesFile" | "exposuresFile">, read: (name: string) => unknown) {
  return readPhaseOneDatasetDocument(`${config.datasetId}:study`, read(config.casesFile), read(config.exposuresFile) as PhaseOneExposure[]);
}

/** Source deletion checks must still run when a saved audit digest is damaged.
 * This projection grants no evaluation/search authority; those use full replay. */
export function readPhaseOneControllerSourceCases(config: Pick<PhaseOneController, "casesFile">, read: (name: string) => unknown): PhaseOneCase[] {
  const value = read(config.casesFile), cases = Array.isArray(value) ? value : (value as { cases?: unknown } | null)?.cases;
  phaseOneAssert(Array.isArray(cases) && cases.length <= 500, "PHASE_ONE_CASES_INVALID");
  return cases as PhaseOneCase[];
}

export function readOwnedPhaseOneDataset(path: string) {
  const directory = controllerDirectory(path), stat = lstatSync(directory);
  phaseOneAssert((stat.mode & 0o077) === 0 && (process.getuid === undefined || stat.uid === process.getuid()), "PHASE_ONE_CONTROLLER_PERMISSIONS_REQUIRED");
  const read = (name: string): unknown => {
    const fd = openSync(join(directory, controllerBasename(name)), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const file = fstatSync(fd);
      phaseOneAssert(file.isFile() && file.size <= 5_000_000 && (file.mode & 0o077) === 0
        && (process.getuid === undefined || file.uid === process.getuid()), "PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
      return JSON.parse(readFileSync(fd, "utf8"));
    } finally { closeSync(fd); }
  };
  phaseOneAssert(!existsSync(join(directory, "phase-one-tombstone.json")), "PHASE_ONE_RUN_TOMBSTONED");
  const config = read("phase-one-controller.json") as PhaseOneController;
  phaseOneAssert(config.schemaVersion === "phase-one-controller.v1" && phaseOneTime(config.expiresAt) > Date.now(), "PHASE_ONE_CONTROLLER_EXPIRED");
  const names = [config.casesFile, config.exposuresFile, config.examplesFile, config.sourceBindingsFile].filter((value): value is string => value !== null);
  names.forEach(controllerBasename);
  phaseOneAssert(new Set(names).size === names.length, "PHASE_ONE_CONTROLLER_FILE_ALIAS_REJECTED");
  return { directory, read, config, ...readPhaseOneControllerDataset(config, read) };
}

/** Same SQLite authority as final artifact writes/tombstones. No raw journal copy. */
function transaction(directory: string, mutate: () => unknown, auditExposure = false): unknown {
  const path = join(directory, "phase-one-artifacts.sqlite"), fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600); closeSync(fd);
  const db = new DatabaseSync(path, { timeout: 5000, allowExtension: false });
  try {
    db.exec("PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS artifact_control (id INTEGER PRIMARY KEY CHECK (id = 1), tombstoned INTEGER NOT NULL); INSERT OR IGNORE INTO artifact_control VALUES (1, 0); BEGIN IMMEDIATE");
    try {
      phaseOneAssert(db.prepare("SELECT tombstoned FROM artifact_control WHERE id = 1").get()?.tombstoned === 0
        && !existsSync(join(directory, "phase-one-tombstone.json")), "PHASE_ONE_RUN_TOMBSTONED");
      // Even a crashed executor must be recovered by its owning command first.
      phaseOneAssert(auditExposure || !existsSync(join(directory, "phase-one-executor.lock")), "PHASE_ONE_EXECUTOR_ALREADY_RUNNING");
      const result = mutate(); db.exec("COMMIT"); return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

function invalidateArtifacts(directory: string): void {
  for (const name of readdirSync(directory)) if (/^phase-one-(?:frozen|executions|verification|release-decision|release-proposal|deployment-receipt|rollback-(?:baseline|candidate|restored|proof))\.json(?:\.[0-9a-f-]+\.tmp)?$/.test(name)) unlinkSync(join(directory, name));
}

export type PhaseOneDatasetRequest = {
  expectedStudyDigest: string;
  actorId: string;
  eventId?: string;
  exposure?: PhaseOneExposure;
  groups?: PhaseOneRetirementGroup[];
  replacements?: PhaseOneCase[];
  caseIds?: string[];
};

/** No provider/model is constructed. Raw replacement inputs arrive over stdin. */
export async function runPhaseOneDatasetLifecycleCommand(command: string, path: string, request?: PhaseOneDatasetRequest,
  dependencies: { backendToken?: string; sourceFetcher?: typeof fetch } = {}): Promise<unknown> {
  phaseOneAssert(["inspect", "expose", "retire-replace", "import-development"].includes(command), "PHASE_ONE_DATASET_COMMAND_INVALID");
  const owned = readOwnedPhaseOneDataset(path);
  if (command === "inspect") return { status: "current", studyDigest: owned.universe.contentDigest, lifecycleDigest: owned.lifecycle?.contentDigest ?? null,
    cases: owned.universe.cases.map(item => ({ caseId: item.caseId, sourcePartition: item.sourcePartition, purpose: item.purpose, currentPurpose: item.currentPurpose })),
    events: owned.lifecycle?.events ?? [], releaseAuthority: "none" };
  phaseOneAssert(request && request.expectedStudyDigest === owned.universe.contentDigest, "PHASE_ONE_LIFECYCLE_STALE_WRITE");
  const before = owned.lifecycle ?? createPhaseOneDatasetLifecycle(owned.universe.datasetId, owned.cases, owned.exposures);
  const input = { eventId: request.eventId ?? randomUUID(), actorId: request.actorId, recordedAt: new Date().toISOString() };
  let next: PhaseOneDatasetLifecycle;
  if (command === "retire-replace") {
    phaseOneAssert(request.groups && request.replacements, "PHASE_ONE_RETIREMENT_INVALID");
    next = retireAndReplacePhaseOneCases(before, { ...input, groups: request.groups, replacements: request.replacements });
  } else {
    const caseIds = request.caseIds;
    if (command === "import-development") phaseOneAssert(caseIds && caseIds.length > 0 && new Set(caseIds).size === caseIds.length, "PHASE_ONE_RETIREMENT_CASE_MISSING");
    const selected = command === "import-development" ? caseIds!.map(id => {
      phaseOneDevelopmentProvenance(before, id); return before.cases.find(item => item.caseId === id)!;
    }) : [];
    const exposure = command === "import-development" ? { sourceIds: [...new Set(selected.flatMap(item => item.sourceIds))], actorId: request.actorId,
      role: "generator" as const, content: "input" as const, observedAt: input.recordedAt } : request.exposure;
    phaseOneAssert(exposure, "PHASE_ONE_EXPOSURE_INVALID"); next = appendPhaseOneExposure(before, { ...input, exposure });
  }
  for (const item of next.cases) {
    const modelInput = validateOptimizationRelationshipInput(item.modelInput);
    phaseOneAssert(owned.config.providerKind !== "deterministic_fake" || modelInput.dataClass === "synthetic", "PHASE_ONE_FIXTURE_REQUIRES_SYNTHETIC_DATA");
  }
  const examples = owned.read(owned.config.examplesFile) as OptimizationDevExample[];
  const bindings = owned.config.sourceBindingsFile ? owned.read(owned.config.sourceBindingsFile) as OptimizationFeedbackBinding[] : [];
  await assertPhaseOnePrivateSources({ cases: next.cases, examples, bindings, baseURL: owned.config.sourceBackendURL,
    token: dependencies.backendToken ?? process.env.TALENT_SIGNAL_PHASE_ONE_SOURCE_TOKEN }, dependencies.sourceFetcher);
  if (command !== "expose" && (next.cases.some(item => (item.modelInput as { dataClass?: string }).dataClass === "private_business")
    || examples.some(item => item.dataClass === "private_business"))) assertOptimizationLifecycleCurrent(owned.directory);
  const searchImport = command === "import-development" ? await prepareSearchImport(owned.directory, next, request.caseIds!, bindings) : null;
  try {
    return transaction(owned.directory, () => {
      const current = readOwnedPhaseOneDataset(owned.directory);
      phaseOneAssert(current.universe.contentDigest === request.expectedStudyDigest
        && digestCanonicalJson(current.config) === digestCanonicalJson(owned.config)
        && digestCanonicalJson(current.read(owned.config.examplesFile)) === digestCanonicalJson(examples)
        && digestCanonicalJson(owned.config.sourceBindingsFile ? current.read(owned.config.sourceBindingsFile) : []) === digestCanonicalJson(bindings), "PHASE_ONE_LIFECYCLE_STALE_WRITE");
      searchImport?.assertCurrent();
      // Primary commit first. Every consumer compares the complete lifecycle,
      // so a crash before derived cleanup/import is stale and cannot execute.
      writeControllerArtifact(owned.directory, owned.config.casesFile, next);
      invalidateArtifacts(owned.directory);
      searchImport?.write();
      return { status: command === "expose" ? "exposure_recorded" : command === "retire-replace" ? "retired_and_replaced" : "development_imported",
        eventId: input.eventId, studyDigest: readPhaseOneControllerDataset(owned.config, owned.read).universe.contentDigest,
        lifecycleDigest: next.contentDigest, releaseAuthority: "none", paidCalls: 0 };
    }, command === "expose");
  } finally { searchImport?.close(); }
}

async function prepareSearchImport(directory: string, lifecycle: PhaseOneDatasetLifecycle, ids: string[], bindings: OptimizationFeedbackBinding[]) {
  const { readOptimizationBudgetController, readOptimizationSearch } = await import("./optimization/controller.js");
  const budget = readOptimizationBudgetController(directory, "dataset-import");
  try {
    phaseOneAssert(budget.ledger.listRuns().every(item => item.status === "tombstoned"), "OPTIMIZATION_IMPORT_REQUIRES_UNUSED_CONTROLLER");
    const search = readOptimizationSearch(directory, budget.configuration, budget.run.bindings, false, true);
    phaseOneAssert(budget.run.bindings.baselineDigest === digestCanonicalJson(optimizationConfiguration(budget.configuration.model, search.baseline, search.examples)), "OPTIMIZATION_FROZEN_INPUT_MISMATCH");
    const originalSearchDigest = digestCanonicalJson(search), originalBindingsDigest = digestCanonicalJson(budget.run.bindings);
    // Refresh proofs of existing conversions after this explicitly audited read.
    for (const item of search.cases.filter(item => item.sourcePartition !== "dev")) {
      const proof = phaseOneDevelopmentProvenance(lifecycle, item.caseId);
      assertPhaseOneRetiredDevelopment(lifecycle, { ...item, developmentProvenance: proof }); item.developmentProvenance = proof;
    }
    for (const id of ids) {
      const item = lifecycle.cases.find(item => item.caseId === id)!;
      phaseOneAssert(!search.cases.some(value => value.caseId === id && value.sourcePartition === "dev"), "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
      const value = { caseId: id, sourcePartition: item.sourcePartition, purpose: "development" as const, referenceTime: item.referenceTime,
        modelInput: validateOptimizationRelationshipInput(item.modelInput), oracle: { ...PHASE_ONE_RETIRED_SEARCH_ORACLE }, developmentProvenance: phaseOneDevelopmentProvenance(lifecycle, id) };
      const index = search.cases.findIndex(value => value.caseId === id);
      if (index === -1) search.cases.push(value); else search.cases[index] = value;
      const source = bindings.find(binding => binding.target === "case" && binding.targetId === id);
      if (source && !search.feedbackSources?.some(binding => binding.target === "case" && binding.targetId === id)) (search.feedbackSources ??= []).push(source);
    }
    phaseOneAssert(search.cases.length <= 100, "OPTIMIZATION_CASE_LIMIT");
    const { readControllerJson } = await import("./optimization/controllerFiles.js");
    return { close: () => budget.ledger.close(), assertCurrent: () => {
      phaseOneAssert(budget.ledger.listRuns().every(item => item.status === "tombstoned")
        && digestCanonicalJson(readControllerJson(directory, budget.configuration.searchFile)) === originalSearchDigest
        && digestCanonicalJson(readControllerJson(directory, budget.configuration.bindingsFile)) === originalBindingsDigest, "PHASE_ONE_LIFECYCLE_STALE_WRITE");
    }, write: () => {
      writeControllerArtifact(directory, budget.configuration.searchFile, search);
      writeControllerArtifact(directory, budget.configuration.bindingsFile, { ...budget.run.bindings, datasetDigest: digestCanonicalJson(search) });
    } };
  } catch (error) { budget.ledger.close(); throw error; }
}
