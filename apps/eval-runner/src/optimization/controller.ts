import { closeSync, constants, existsSync, fstatSync, openSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { renderRelationshipTaskSelectionModule, RuntimeObserver, RuntimeObservationOutbox, RuntimeObservationPolicySchema,
  PrivateOpikRuntimeTransport, type RuntimeObservationContext } from "@talent-signal/agent";
import { labReadbackURL } from "../labRegressionReadback.js";
import { assertFeedbackBindingCurrent, feedbackBindingFromBundle, isOptimizationFeedbackSourceInvalidated, optimizationDemonstrationFromFeedback, optimizationInputFromFeedback, readOptimizationFeedbackSource,
  validateOptimizationFeedbackBinding, type OptimizationFeedbackBinding, type OptimizationFeedbackProposal } from "./feedbackSource.js";
import { assertPhaseOneRetiredDevelopment, digestCanonicalJson, type DatasetPartition, type JsonValue, type PhaseOneDevelopmentProvenance, type PhaseOneProductRequest } from "@talent-signal/evaluation";
import { readOwnedPhaseOneDataset } from "../phaseOneDatasetLifecycle.js";
import { FileOptimizationBudgetLedger, type OptimizationBudgetBindings, type OptimizationBudgetPermit, type OptimizationBudgetRunInput } from "./budget.js";
import { controllerBasename, controllerDirectory, makeControllerDirectory, readControllerJson, writeControllerArtifact } from "./controllerFiles.js";
import { replayOptimizerSearch, runOptimizerSearch, type OptimizerSearchReport } from "./optimizer.js";
import { assertOptimizationLifecycleCurrent, runOptimizationLifecycle } from "./lifecycle.js";
import { OPTIMIZER_VERSION, createOptimizationProductTaskAdapter, optimizationConfiguration, replayOptimizationProductTask,
  validateOptimizationCandidate, validateOptimizationRelationshipInput, type OptimizationCandidate, type OptimizationDevExample,
  type OptimizationRelationshipInput, type ProductTaskRecording } from "./productTask.js";

export const OPTIMIZATION_SEARCH_EVALUATOR = "relationship-boundary-search.v1";
// Maintenance keeps the process alive; an export failure never delays source
// validation or changes its heartbeat. Durable outbox locks fence other processes.
const observationFlushes = new Map<string, Promise<void>>();
export interface OptimizationControllerConfiguration {
  schemaVersion: "optimization-controller.v1";
  ledgerFile: string;
  permitFile: string | null;
  bindingsFile: string;
  model: string;
  pricing: { currency: string; inputMicrosPerMillionTokens: number; outputMicrosPerMillionTokens: number } | null;
  searchFile: string;
  sourceBackendURL?: string;
  observationScope?: { workspaceId: string; authorizationScope: string };
}
export interface OptimizationSearchCase {
  caseId: string;
  sourcePartition: DatasetPartition;
  purpose: "development";
  referenceTime: string;
  modelInput: OptimizationRelationshipInput;
  oracle: { allowedKinds: string[]; requiredCitationIds: string[] };
  developmentProvenance?: PhaseOneDevelopmentProvenance;
}
export interface OptimizationSearchInput {
  schemaVersion: "optimization-search-input.v1";
  baseline: OptimizationCandidate;
  examples: OptimizationDevExample[];
  cases: OptimizationSearchCase[];
  maximumTrials: number;
  repetitions: number;
  timeoutMs: number;
  feedbackSources?: OptimizationFeedbackBinding[];
  feedbackProposals?: OptimizationFeedbackProposal[];
}
function record(value: unknown, keys: string[], code: string, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || keys.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key))) throw new Error(code);
  return value as Record<string, unknown>;
}
export function readOptimizationBudgetController(directory: string, runId: string): {
  configuration: OptimizationControllerConfiguration; ledger: FileOptimizationBudgetLedger; run: OptimizationBudgetRunInput;
  model: string; pricing: OptimizationControllerConfiguration["pricing"];
} {
  const path = controllerDirectory(directory);
  const raw = record(readControllerJson(path, "controller.json"), ["schemaVersion", "ledgerFile", "permitFile", "bindingsFile", "model", "pricing", "searchFile"], "OPTIMIZATION_CONTROLLER_INVALID", ["sourceBackendURL", "observationScope"]);
  if (raw.schemaVersion !== "optimization-controller.v1" || typeof raw.model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,199}$/.test(raw.model)) throw new Error("OPTIMIZATION_CONTROLLER_INVALID");
  for (const key of ["ledgerFile", "bindingsFile", "searchFile"]) controllerBasename(raw[key]);
  if (raw.permitFile !== null) controllerBasename(raw.permitFile);
  if (raw.sourceBackendURL !== undefined) { if (typeof raw.sourceBackendURL !== "string") throw new Error("OPTIMIZATION_CONTROLLER_INVALID"); labReadbackURL(raw.sourceBackendURL); }
  if (raw.observationScope !== undefined) {
    const scope = record(raw.observationScope, ["workspaceId", "authorizationScope"], "OPTIMIZATION_OBSERVATION_SCOPE_INVALID");
    if (![scope.workspaceId, scope.authorizationScope].every(value => typeof value === "string" && value.length > 0 && value.length <= 100)) throw new Error("OPTIMIZATION_OBSERVATION_SCOPE_INVALID");
  }
  if (raw.pricing !== null) {
    const pricing = record(raw.pricing, ["currency", "inputMicrosPerMillionTokens", "outputMicrosPerMillionTokens"], "OPTIMIZATION_PRICING_INVALID");
    if (typeof pricing.currency !== "string" || !/^[A-Z]{3}$/.test(pricing.currency)
      || ![pricing.inputMicrosPerMillionTokens, pricing.outputMicrosPerMillionTokens].every(value => typeof value === "number" && Number.isSafeInteger(value) && value > 0)) throw new Error("OPTIMIZATION_PRICING_INVALID");
  }
  const configuration = raw as unknown as OptimizationControllerConfiguration;
  const bindings = record(readControllerJson(path, configuration.bindingsFile), ["baselineDigest", "datasetDigest", "evaluatorVersion", "optimizerVersion"], "OPTIMIZATION_BINDINGS_INVALID") as unknown as OptimizationBudgetBindings;
  if (![bindings.baselineDigest, bindings.datasetDigest].every(value => /^sha256:[a-f0-9]{64}$/.test(value))
    || typeof bindings.evaluatorVersion !== "string" || typeof bindings.optimizerVersion !== "string") throw new Error("OPTIMIZATION_BINDINGS_INVALID");
  const permit = configuration.permitFile === null ? undefined : readControllerJson(path, configuration.permitFile) as OptimizationBudgetPermit;
  const ledger = new FileOptimizationBudgetLedger({ path: join(path, configuration.ledgerFile) });
  return { configuration, ledger, run: { runId, bindings, ...(permit ? { permit } : {}) }, model: configuration.model, pricing: configuration.pricing };
}
export function readOptimizationSearch(directory: string, configuration: OptimizationControllerConfiguration, bindings: OptimizationBudgetBindings, verifyFrozen = true, allowStaleRetirementProof = false, allowLegacySourceCleanup = false): OptimizationSearchInput {
  const raw = record(readControllerJson(directory, configuration.searchFile), ["schemaVersion", "baseline", "examples", "cases", "maximumTrials", "repetitions", "timeoutMs"], "OPTIMIZATION_SEARCH_INVALID", ["feedbackSources", "feedbackProposals"]);
  if (raw.schemaVersion !== "optimization-search-input.v1" || !Array.isArray(raw.examples) || raw.examples.length > 16
    || !Array.isArray(raw.cases) || raw.cases.length < 1 || raw.cases.length > 100
    || !Number.isSafeInteger(raw.maximumTrials) || (raw.maximumTrials as number) < 1 || (raw.maximumTrials as number) > 32
    || !Number.isSafeInteger(raw.repetitions) || (raw.repetitions as number) < 2 || (raw.repetitions as number) > 10
    || !Number.isSafeInteger(raw.timeoutMs) || (raw.timeoutMs as number) < 100 || (raw.timeoutMs as number) > 3600000) throw new Error("OPTIMIZATION_SEARCH_INVALID");
  const search = raw as unknown as OptimizationSearchInput;
  validateOptimizationCandidate(search.baseline, search.examples);
  const ids = new Set<string>();
  for (const value of search.cases) {
    record(value, ["caseId", "sourcePartition", "purpose", "referenceTime", "modelInput", "oracle"], "OPTIMIZATION_CASE_INVALID", ["developmentProvenance"]);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value.caseId) || ids.has(value.caseId) || !["dev", "p0", "held_out", "red_team"].includes(value.sourcePartition) || value.purpose !== "development"
      || !Number.isFinite(Date.parse(value.referenceTime))) throw new Error("OPTIMIZATION_DEVELOPMENT_CASE_REQUIRED");
    if (value.sourcePartition !== "dev") {
      // Cleanup and explicit import repair still inspect native expiry/revocation
      // when final authority has already changed or been tombstoned.
      if (!allowStaleRetirementProof) {
        if (!value.developmentProvenance) throw new Error("OPTIMIZATION_DEVELOPMENT_CASE_REQUIRED");
        const owned = readOwnedPhaseOneDataset(directory);
        if (!owned.lifecycle) throw new Error("PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
        assertPhaseOneRetiredDevelopment(owned.lifecycle, value);
      }
    } else if (value.developmentProvenance) throw new Error("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    ids.add(value.caseId);
    validateOptimizationRelationshipInput(value.modelInput);
    const oracle = record(value.oracle, ["allowedKinds", "requiredCitationIds"], "OPTIMIZATION_ORACLE_INVALID");
    if (!Array.isArray(oracle.allowedKinds) || oracle.allowedKinds.length < 1 || oracle.allowedKinds.length > 4
      || oracle.allowedKinds.some(value => !["answer", "clarification", "question_set"].includes(String(value)))
      || !Array.isArray(oracle.requiredCitationIds) || oracle.requiredCitationIds.some(id => typeof id !== "string" || !value.modelInput.allowed_citation_ids.includes(id))) throw new Error("OPTIMIZATION_ORACLE_INVALID");
  }
  if (search.feedbackSources !== undefined && (!Array.isArray(search.feedbackSources) || search.feedbackSources.length > 116)) throw new Error("OPTIMIZATION_FEEDBACK_BINDING_INVALID");
  const targets = new Set<string>();
  for (const source of search.feedbackSources ?? []) {
    validateOptimizationFeedbackBinding(source, allowLegacySourceCleanup ? "cleanup" : "admission");
    const key = source.target + ":" + source.targetId;
    const item = source.target === "case" ? search.cases.find(item => item.caseId === source.targetId)?.modelInput : search.examples.find(item => item.exampleId === source.targetId);
    if (targets.has(key) || item?.dataClass !== "private_business") throw new Error("OPTIMIZATION_FEEDBACK_BINDING_INVALID");
    targets.add(key);
  }
  if (search.cases.some(item => item.modelInput.dataClass === "private_business" && !targets.has("case:" + item.caseId))
    || search.examples.some(item => item.dataClass === "private_business" && !targets.has("example:" + item.exampleId))) throw new Error("OPTIMIZATION_PRIVATE_SOURCE_BINDING_REQUIRED");
  if (search.feedbackProposals !== undefined) {
    if (!Array.isArray(search.feedbackProposals) || search.feedbackProposals.length > 100) throw new Error("OPTIMIZATION_FEEDBACK_PROPOSAL_INVALID");
    for (const proposal of search.feedbackProposals) {
      record(proposal, ["caseId", "feedbackId", "feedbackRevision", "expectationAuthority", "text"], "OPTIMIZATION_FEEDBACK_PROPOSAL_INVALID");
      const source = search.feedbackSources?.find(source => source.target === "case" && source.targetId === proposal.caseId);
      if (!source || proposal.feedbackId !== source.feedbackId || proposal.feedbackRevision !== source.feedbackRevision || proposal.expectationAuthority !== "proposal"
        || typeof proposal.text !== "string" || proposal.text.length > 2000) throw new Error("OPTIMIZATION_FEEDBACK_PROPOSAL_INVALID");
    }
  }
  if (verifyFrozen && (bindings.optimizerVersion !== OPTIMIZER_VERSION || bindings.evaluatorVersion !== OPTIMIZATION_SEARCH_EVALUATOR
    || bindings.datasetDigest !== digestCanonicalJson(search) || bindings.baselineDigest !== digestCanonicalJson(optimizationConfiguration(configuration.model, search.baseline, search.examples)))) throw new Error("OPTIMIZATION_FROZEN_INPUT_MISMATCH");
  return search;
}
const readSearch = readOptimizationSearch;

/** Cleanup honors an already committed local withdrawal without depending on
 * native availability or the integrity of an obsolete dataset document. */
function phaseOneSourceAuthorityTombstoned(directory: string): boolean {
  if (existsSync(join(directory, "phase-one-tombstone.json"))) return true;
  const path = join(directory, "phase-one-artifacts.sqlite");
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  try {
    const file = fstatSync(fd);
    if (!file.isFile() || (file.mode & 0o077) !== 0 || process.getuid !== undefined && file.uid !== process.getuid()) throw new Error("PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
    const parentFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const parent = fstatSync(parentFd);
      if (!parent.isDirectory() || (parent.mode & 0o077) !== 0 || process.getuid !== undefined && parent.uid !== process.getuid()) throw new Error("PHASE_ONE_CONTROLLER_PERMISSIONS_REQUIRED");
      // DatabaseSync accepts a path, not an existing fd. Its reopen is confined
      // to the same owner-only controller directory; other users cannot replace
      // its entries. Keep both validated descriptors open through the read.
      const db = new DatabaseSync(path, { readOnly: true, timeout: 5000, allowExtension: false });
      try {
        if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'artifact_control'").get()) return false;
        return db.prepare("SELECT tombstoned FROM artifact_control WHERE id = 1").get()?.tombstoned === 1;
      } finally { db.close(); }
    } finally { closeSync(parentFd); }
  } finally { closeSync(fd); }
}
function runDirectory(directory: string, runId: string): string {
  return makeControllerDirectory(makeControllerDirectory(directory, "runs"), digestCanonicalJson(runId).slice(7));
}
function controllerBinding(configuration: OptimizationControllerConfiguration, run: OptimizationBudgetRunInput) {
  return { schemaVersion: "optimization-run-control.v1", runId: run.runId,
    controllerDigest: digestCanonicalJson({ configuration, bindings: run.bindings, permit: run.permit ?? null }) };
}
export function assertOptimizationControllerBinding(directory: string, configuration: OptimizationControllerConfiguration, run: OptimizationBudgetRunInput): void {
  const path = join(directory, "runs", digestCanonicalJson(run.runId).slice(7));
  if (digestCanonicalJson(readControllerJson(path, "run-control.json")) !== digestCanonicalJson(controllerBinding(configuration, run))) throw new Error("OPTIMIZATION_CONTROLLER_BINDING_CHANGED");
}
export interface OptimizationControllerCommandResult {
  schemaVersion: "optimization-controller-result.v1";
  command: string;
  status: string;
  runId: string;
  releaseAuthority: "none";
  semanticQuality: "not_run";
  details: unknown;
}
/** Only the controller owns corpus, oracle, ledger, credentials and durable output. */
export async function runOptimizationControllerCommand(argv: readonly string[], directory: string, dependencies: {
  /** Test injection is explicit and is never accepted from a controller input or CLI flag. */
  offlineFetcher?: typeof fetch;
  apiKey?: string;
  backendToken?: string;
  sourceFetcher?: typeof fetch;
  observer?: RuntimeObserver | null;
  signal?: AbortSignal;
} = {}): Promise<OptimizationControllerCommandResult> {
  const [command, ...args] = argv;
  const once = command === "maintain" && args.at(-1) === "--once";
  if (once) args.pop();
  if (!command || !["maintain", "source-sweep", "import-feedback", "start", "status", "stop", "resume", "revoke", "tombstone", "run", "replay"].includes(command)
    || (command === "import-feedback" ? args.length !== 4 || args[2] !== "--regression-id" : args.length !== 2)
    || args[0] !== "--run-id" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(args[1] ?? "")) throw new Error("OPTIMIZATION_COMMAND_INVALID");
  const runId = args[1]!, owned = readOptimizationBudgetController(directory, runId);
  const { ledger, run, configuration } = owned;
  let runtimeObserver = dependencies.observer ?? null;
  let ownsObserver = false;
  const ensureObserver = () => {
    if (!runtimeObserver && configuration.observationScope && process.env.TALENT_SIGNAL_OPIK_RUNTIME_POLICY) {
      try {
        const policy = RuntimeObservationPolicySchema.parse(JSON.parse(process.env.TALENT_SIGNAL_OPIK_RUNTIME_POLICY));
        const outbox = new RuntimeObservationOutbox(makeControllerDirectory(directory, "runtime-outbox"), policy, new PrivateOpikRuntimeTransport(policy, process.env.OPIK_API_KEY));
        runtimeObserver = new RuntimeObserver(outbox, [dependencies.apiKey, dependencies.backendToken, process.env.OPIK_API_KEY].filter((value): value is string => Boolean(value)));
        ownsObserver = true;
      } catch { /* Observability has no execution or release authority. */ }
    }
  };
  let executorOwner: string | undefined;
  const verifyControllerBinding = () => assertOptimizationControllerBinding(directory, configuration, run);
  const result = (status: string, details: unknown): OptimizationControllerCommandResult => ({ schemaVersion: "optimization-controller-result.v1", command, status, runId,
    releaseAuthority: "none", semanticQuality: "not_run", details });
  const readSource = (regressionId: string) => {
    if (!configuration.sourceBackendURL || !dependencies.backendToken) throw new Error("OPTIMIZATION_FEEDBACK_READBACK_UNCONFIGURED");
    return readOptimizationFeedbackSource({ baseURL: configuration.sourceBackendURL, token: dependencies.backendToken, regressionId,
      ...(dependencies.signal ? { signal: dependencies.signal } : {}) }, dependencies.sourceFetcher);
  };
  const configureObserver = (search: OptimizationSearchInput | null) => {
    ensureObserver();
    if (!configuration.observationScope) return;
    runtimeObserver?.outbox.setSourceValidator(async context => {
      const ids = [...new Set([...(context.source_regression_ids ?? []), ...(context.source_regression_id ? [context.source_regression_id] : [])])];
      if (!ids.length) return search !== null && context.source_refs?.kind === "synthetic";
      for (const id of ids) {
        const source = search?.feedbackSources?.find(source => source.regressionId === id);
        if (!source) return false;
        if (Date.parse(source.expiresAt) <= Date.now()) return false;
        try { assertFeedbackBindingCurrent(source, await readSource(id)); }
        catch (error) { if (isOptimizationFeedbackSourceInvalidated(error)) return false; throw error; }
      }
      return true;
    });
  };
  const flushObservations = () => {
    if (!runtimeObserver) return;
    const key = directory + ":" + digestCanonicalJson(runtimeObserver.outbox.policy);
    if (observationFlushes.has(key)) return;
    const observer = runtimeObserver;
    const pending = observer.outbox.flush().catch(() => { observer.last_error_code = "RUNTIME_OBSERVATION_EXPORT_UNAVAILABLE"; })
      .finally(() => { if (observationFlushes.get(key) === pending) observationFlushes.delete(key); });
    observationFlushes.set(key, pending);
  };
  const purge = async (search: OptimizationSearchInput) => {
    ensureObserver();
    const actualDatasetDigest = digestCanonicalJson(search);
    const affected = ledger.listRuns().filter(item => item.bindings.datasetDigest === run.bindings.datasetDigest || item.bindings.datasetDigest === actualDatasetDigest);
    for (const item of affected) {
      ledger.tombstone(item.runId);
      rmSync(join(directory, "runs", digestCanonicalJson(item.runId).slice(7)), { recursive: true, force: true });
    }
    if (search.feedbackSources?.length && digestCanonicalJson(readControllerJson(directory, configuration.searchFile)) === actualDatasetDigest) {
      writeControllerArtifact(directory, configuration.searchFile, { schemaVersion: "optimization-search-tombstone.v1", datasetDigest: actualDatasetDigest, reason: "feedback_source_unavailable_or_changed" });
    }
    if (runtimeObserver && configuration.observationScope) {
      for (const context of await runtimeObserver.outbox.sourceRuns()) {
        if (context.workspace_id === configuration.observationScope.workspaceId && affected.some(item => context.run_id.startsWith("optimization:" + item.runId + ":"))) await runtimeObserver.outbox.deleteRun(context, true);
      }
      flushObservations();
    }
  };
  const assertSources = async (search: OptimizationSearchInput) => {
    const locallyWithdrawn = () => command === "source-sweep" && search.cases.some(item => item.sourcePartition !== "dev")
      && phaseOneSourceAuthorityTombstoned(directory);
    try {
      if (locallyWithdrawn()) throw new Error("PHASE_ONE_RUN_TOMBSTONED");
      const checks = await Promise.allSettled((search.feedbackSources ?? []).map(async source => {
        if (Date.parse(source.expiresAt) <= Date.now()) throw new Error("OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
        const bundle = await readSource(source.regressionId);
        assertFeedbackBindingCurrent(source, bundle);
        if (source.target === "case") {
          const item = search.cases.find(item => item.caseId === source.targetId);
          if (digestCanonicalJson(optimizationInputFromFeedback(bundle)) !== digestCanonicalJson(item?.modelInput)
            || item?.referenceTime !== bundle.snapshot.reference_time) throw new Error("OPTIMIZATION_FEEDBACK_INPUT_CHANGED");
          const proposal = search.feedbackProposals?.find(item => item.caseId === source.targetId);
          if (proposal && proposal.text !== bundle.snapshot.expected_behavior) throw new Error("OPTIMIZATION_FEEDBACK_INPUT_CHANGED");
        }
        if (source.target === "example") {
          const example = search.examples.find(item => item.exampleId === source.targetId);
          const expected = optimizationDemonstrationFromFeedback(bundle);
          if (example?.demonstration !== expected || example.contentDigest !== digestCanonicalJson(expected)) throw new Error("OPTIMIZATION_FEEDBACK_INPUT_CHANGED");
        }
      }));
      const rejected = checks.filter((check): check is PromiseRejectedResult => check.status === "rejected");
      const invalidated = rejected.find(check => isOptimizationFeedbackSourceInvalidated(check.reason));
      if (invalidated) throw invalidated.reason;
      if (rejected.length) throw rejected[0]!.reason;
      for (const item of search.cases.filter(item => item.sourcePartition !== "dev")) {
        const owned = readOwnedPhaseOneDataset(directory);
        if (!owned.lifecycle) throw new Error("PHASE_ONE_RETIREMENT_PROVENANCE_REQUIRED");
        assertPhaseOneRetiredDevelopment(owned.lifecycle, item);
      }
    } catch (error) {
      // Withdrawal can also commit while native readback is in flight. A 503
      // must not mask that now-known revocation or strand its private copies.
      const withdrawn = locallyWithdrawn();
      if (isOptimizationFeedbackSourceInvalidated(error)
        || withdrawn || error instanceof Error && error.message === "PHASE_ONE_RUN_TOMBSTONED" && search.cases.some(item => item.sourcePartition !== "dev")) await purge(search);
      else {
        const current = ledger.listRuns().find(item => item.runId === runId);
        if (current?.status === "running") ledger.checkpoint(runId, "source_readback_unavailable");
      }
      throw withdrawn ? new Error("PHASE_ONE_RUN_TOMBSTONED") : error;
    }
  };
  try {
    if (command === "maintain") {
      const heartbeat = await runOptimizationLifecycle({ directory, ledger, ...(dependencies.signal ? { signal: dependencies.signal } : {}), once,
        watchedFiles: [configuration.searchFile, configuration.bindingsFile, "phase-one-controller.json"],
        sweep: async () => {
          const { sweepPhaseOneControllerSources } = await import("../phaseOneCommand.js");
          const [search, final] = await Promise.allSettled([
            runOptimizationControllerCommand(["source-sweep", "--run-id", runId], directory, dependencies),
            sweepPhaseOneControllerSources(directory, { ...(dependencies.backendToken ? { backendToken: dependencies.backendToken } : {}), ...(dependencies.sourceFetcher ? { sourceFetcher: dependencies.sourceFetcher } : {}) }),
          ]);
          if (search.status === "rejected") throw search.reason;
          if (final.status === "rejected") throw final.reason;
          const local = search.value;
          return (local.details as { datasetDigest?: string }).datasetDigest ?? null;
        } });
      return result(heartbeat.state, heartbeat);
    }
    if (command === "source-sweep") {
      const raw = readControllerJson(directory, configuration.searchFile) as { schemaVersion?: string };
      if (raw.schemaVersion === "optimization-search-tombstone.v1") {
        configureObserver(null);
        // Retry deletion of already tombstoned runs even if Opik was offline
        // or observation configuration was unavailable during source cleanup.
        const deleted = ledger.listRuns().filter(item => item.status === "tombstoned");
        if (runtimeObserver && configuration.observationScope) for (const context of await runtimeObserver.outbox.sourceRuns()) {
          if (context.workspace_id === configuration.observationScope.workspaceId && deleted.some(item => context.run_id.startsWith("optimization:" + item.runId + ":"))) await runtimeObserver.outbox.deleteRun(context, true);
        }
        flushObservations();
        return result("tombstoned", { datasetDigest: null });
      }
      // Historical metadata may still prove expiry or revocation; it cannot
      // grant Session grouping authority to start, resume, or execute a run.
      const search = readSearch(directory, configuration, run.bindings, false, true, true);
      configureObserver(search);
      await assertSources(search);
      flushObservations();
      return result("sources_current", { datasetDigest: digestCanonicalJson(search) });
    }
    if (command === "import-feedback") {
      assertOptimizationLifecycleCurrent(directory);
      if (ledger.listRuns().some(item => item.status !== "tombstoned")) throw new Error("OPTIMIZATION_IMPORT_REQUIRES_UNUSED_CONTROLLER");
      const search = readSearch(directory, configuration, run.bindings, false), bundle = await readSource(args[3]!);
      if (run.bindings.baselineDigest !== digestCanonicalJson(optimizationConfiguration(configuration.model, search.baseline, search.examples))) throw new Error("OPTIMIZATION_FROZEN_INPUT_MISMATCH");
      const caseId = "feedback-" + bundle.id, modelInput = optimizationInputFromFeedback(bundle), source = feedbackBindingFromBundle(bundle, caseId);
      const existing = search.feedbackSources?.find(item => item.target === "case" && item.targetId === caseId);
      if (existing) {
        assertFeedbackBindingCurrent(existing, bundle); await assertSources(search);
        writeControllerArtifact(directory, configuration.bindingsFile, { ...run.bindings, datasetDigest: digestCanonicalJson(search) });
        return result("already_imported", { caseId, regressionId: bundle.id, expectationAuthority: "proposal" });
      }
      if (search.cases.length >= 100) throw new Error("OPTIMIZATION_CASE_LIMIT");
      search.cases.push({ caseId, sourcePartition: "dev", purpose: "development", referenceTime: bundle.snapshot.reference_time, modelInput,
        oracle: { allowedKinds: ["answer", "clarification", "question_set"], requiredCitationIds: [] } });
      (search.feedbackSources ??= []).push(source);
      (search.feedbackProposals ??= []).push({ caseId, feedbackId: source.feedbackId, feedbackRevision: source.feedbackRevision,
        expectationAuthority: "proposal", text: bundle.snapshot.expected_behavior });
      // Confirm lineage once more after construction, before any private write.
      assertFeedbackBindingCurrent(source, await readSource(bundle.id));
      writeControllerArtifact(directory, configuration.searchFile, search);
      const nextBindings = { ...run.bindings, datasetDigest: digestCanonicalJson(search) };
      writeControllerArtifact(directory, configuration.bindingsFile, nextBindings);
      return result("imported", { caseId, regressionId: bundle.id, datasetDigest: nextBindings.datasetDigest, expectationAuthority: "proposal" });
    }
    if (command === "start") {
      const search = readSearch(directory, configuration, run.bindings); await assertSources(search);
      const started = ledger.startRun(run), output = runDirectory(directory, runId);
      ledger.withRunArtifactWrite(runId, () => writeControllerArtifact(output, "run-control.json", controllerBinding(configuration, run)));
      return result(started.status, ledger.summarize(runId));
    }
    if (command === "status") return result(ledger.snapshot(runId).status, ledger.summarize(runId));
    if (command === "stop") return result(ledger.checkpoint(runId).status, ledger.summarize(runId));
    if (command === "resume") { verifyControllerBinding(); const search = readSearch(directory, configuration, run.bindings); await assertSources(search); return result(ledger.resume(run).status, ledger.summarize(runId)); }
    if (command === "revoke") {
      const permitId = ledger.snapshot(runId).permit?.permitId;
      if (!permitId) return result("unconfigured", ledger.summarize(runId));
      ledger.revokePermit(permitId); return result(ledger.snapshot(runId).status, ledger.summarize(runId));
    }
    if (command === "tombstone") {
      const current = ledger.snapshot(runId);
      if (current.status !== "tombstoned") {
        const search = readSearch(directory, configuration, run.bindings);
        await purge(search);
      }
      return result("tombstoned", ledger.summarize(runId));
    }
    const state = ledger.snapshot(runId);
    if (state.status === "tombstoned") return result("tombstoned", ledger.summarize(runId));
    verifyControllerBinding();
    if (command === "run" && state.status === "running") {
      const owner = randomUUID();
      ledger.acquireRunController(runId, owner);
      executorOwner = owner;
    }
    const search = readSearch(directory, configuration, run.bindings);
    configureObserver(search);
    await assertSources(search);
    runtimeObserver?.startBackgroundExport();
    const output = runDirectory(directory, runId);
    const recorded = existsSync(join(output, "search-report.json")) ? readControllerJson(output, "search-report.json") as OptimizerSearchReport : undefined;
    if (command === "replay") {
      if (!recorded) throw new Error("OPTIMIZATION_REPORT_NOT_FOUND");
      return result("recorded_replay", replayOptimizerSearch(recorded, search.examples));
    }
    if (state.status !== "running" || !run.permit || !owned.pricing) return result(state.status === "running" ? "unconfigured" : state.status, ledger.summarize(runId));
    if (!dependencies.offlineFetcher && !dependencies.apiKey?.trim()) return result("unconfigured", { reason: "provider_credential_missing", budget: ledger.summarize(runId) });
    if (recorded && ["search_exhausted", "trial_limit"].includes(recorded.stopReason)) return result("recorded_replay", replayOptimizerSearch(recorded, search.examples));
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, ...(dependencies.signal ? [dependencies.signal] : [])]);
    const polling = setInterval(() => { try { if (ledger.snapshot(runId).status !== "running") abort.abort(); } catch { abort.abort(); } }, 100);
    try {
      const report = await runOptimizerSearch({ baseline: search.baseline, examples: search.examples, bindings: run.bindings,
        maximumTrials: search.maximumTrials, timeoutMs: search.timeoutMs, ...(recorded ? { resume: recorded } : {}), signal,
        onCheckpoint: async checkpoint => {
          if (ledger.snapshot(runId).status === "tombstoned") return;
          await assertSources(search);
          ledger.withRunArtifactWrite(runId, () => writeControllerArtifact(output, "search-report.json", checkpoint));
        },
        evaluate: async (candidate, trialId, trialSignal) => {
          await assertSources(search);
          ledger.registerCandidate({ ...run, candidateId: trialId });
          const config = optimizationConfiguration(configuration.model, candidate, search.examples);
          const receiptDigests: `sha256:${string}`[] = [];
          let passed = 0, total = 0;
          for (const item of search.cases) for (let repetition = 1; repetition <= search.repetitions; repetition++) {
            if (trialSignal.aborted || ledger.snapshot(runId).status !== "running") throw new Error("OPTIMIZATION_STOPPED");
            await assertSources(search);
            if (search.feedbackSources?.length) assertOptimizationLifecycleCurrent(directory, run.bindings.datasetDigest);
            const request: PhaseOneProductRequest = { caseId: item.caseId, modelInput: item.modelInput as unknown as JsonValue,
              referenceTime: item.referenceTime, configuration: config, configurationDigest: digestCanonicalJson(config), repetition, seed: repetition - 1,
              idempotencyKey: digestCanonicalJson({ runId, bindings: run.bindings, trialId, caseId: item.caseId, repetition }) };
            const artifact = `receipt-${digestCanonicalJson(request).slice(7)}.json`;
            const cached = existsSync(join(output, artifact)) ? readControllerJson(output, artifact) as ProductTaskRecording : undefined;
            if (cached && cached.receipt.providerKind !== (dependencies.offlineFetcher ? "deterministic_fake" : "real_model")) throw new Error("OPTIMIZATION_PROVIDER_KIND_CHANGED");
            const operation = ledger.snapshot(runId).operations.find(op => op.operationId === `subject:${request.idempotencyKey}`);
            // A process lost after issue must never create a second paid request.
            if (!cached && operation) throw new Error("OPTIMIZATION_ISSUED_RECEIPT_UNAVAILABLE");
            const sources = search.feedbackSources?.filter(source => (source.target === "case" && source.targetId === item.caseId)
              || (source.target === "example" && candidate.exampleIds.includes(source.targetId))) ?? [];
            const observation: RuntimeObservationContext | undefined = configuration.observationScope ? {
              run_id: "optimization:" + runId + ":" + request.idempotencyKey.slice(7, 39), workspace_id: configuration.observationScope.workspaceId,
              authorization_scope: configuration.observationScope.authorizationScope,
              ...(sources.length ? { source_regression_ids: [...new Set(sources.map(source => source.regressionId))],
                source_refs: { kind: "product", capture_ids: [], fragment_ids: [], media_ids: [], person_ids: [], relationship_context_ids: [], expires_at: new Date(Math.min(...sources.map(source => Date.parse(source.expiresAt)))).toISOString() } }
                : { source_refs: { kind: "synthetic" } }),
            } : undefined;
            const adapter = createOptimizationProductTaskAdapter({ model: configuration.model, examples: search.examples, signal: trialSignal,
              ...(runtimeObserver ? { observer: runtimeObserver } : {}), ...(observation ? { observation } : {}),
              ...(dependencies.offlineFetcher ? { providerKind: "deterministic_fake" as const, fetcher: dependencies.offlineFetcher }
                : { providerKind: "real_model" as const, apiKey: dependencies.apiKey!, budget: { ledger, run, phase: "search" as const, pricing: owned.pricing! } }),
              beforeDispatch: async () => {
                await assertSources(search);
                if (search.feedbackSources?.length) assertOptimizationLifecycleCurrent(directory, run.bindings.datasetDigest);
              },
              onRecording: async recording => { await assertSources(search); ledger.withRunArtifactWrite(runId, () => writeControllerArtifact(output, artifact, recording)); } });
            const receipt = cached ? replayOptimizationProductTask(cached, request) : await adapter.execute(request);
            receiptDigests.push(digestCanonicalJson(receipt));
            if (receipt.status !== "completed") throw new Error("OPTIMIZATION_PRODUCT_EXECUTION_UNAVAILABLE");
            const answer = receipt.output as { kind?: string; citation_ids?: string[] } | null;
            const passes = Boolean(answer && item.oracle.allowedKinds.includes(answer.kind ?? "") && Array.isArray(answer.citation_ids)
              && answer.citation_ids.every(id => item.modelInput.allowed_citation_ids.includes(id))
              && item.oracle.requiredCitationIds.every(id => answer.citation_ids!.includes(id)));
            passed += passes ? 1 : 0; total++;
          }
          return { score: passed / total, hardGate: passed === total, receiptDigests };
        } });
      if (ledger.snapshot(runId).status !== "tombstoned" && ["search_exhausted", "trial_limit"].includes(report.stopReason)) {
        await assertSources(search);
        const candidateConfiguration = optimizationConfiguration(configuration.model, report.best, search.examples);
        const privateExampleSelected = search.examples.some(example => report.best.exampleIds.includes(example.exampleId) && example.dataClass === "private_business");
        ledger.withRunArtifactWrite(runId, () => writeControllerArtifact(output, "candidate-release-input.json", {
          schemaVersion: "optimization-candidate-release-input.v1", candidate: report.best,
          examples: search.examples.filter(example => report.best.exampleIds.includes(example.exampleId)),
          configuration: candidateConfiguration, configurationDigest: digestCanonicalJson(candidateConfiguration),
          searchReportDigest: report.reportDigest, sourceModule: privateExampleSelected ? null : renderRelationshipTaskSelectionModule(report.best, search.examples),
          globalSourceRelease: privateExampleSelected ? "private_demonstration_not_globally_distributable" : "requires_independent_authorization",
          releaseAuthority: "none", semanticQuality: "not_run",
        }));
      }
      if (ledger.snapshot(runId).status === "running") ledger.checkpoint(runId, ["search_exhausted", "trial_limit"].includes(report.stopReason) ? "search_finished_pending_independent_validation" : `optimizer_${report.stopReason}`);
      return result(ledger.snapshot(runId).status, { report, budget: ledger.summarize(runId), providerKind: dependencies.offlineFetcher ? "deterministic_fake" : "real_model",
        observation: runtimeObserver ? { status: runtimeObserver.last_error_code ?? "durably_queued", policy: runtimeObserver.outbox.policy } : { status: "unconfigured" } });
    } finally { clearInterval(polling); }
  } finally {
    if (ownsObserver) runtimeObserver?.dispose();
    try { if (executorOwner) ledger.releaseRunController(runId, executorOwner); }
    finally { ledger.close(); }
  }
}
