import { constants, closeSync, fstatSync, fsyncSync, lstatSync, linkSync, openSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { randomUUID, sign, verify } from "node:crypto";
import {
  assertPhaseOneDatasetCurrent, canonicalJson, digestCanonicalJson, freezePhaseOneComparison,
  freezePhaseOneDataset, phaseOneAssert, phaseOneId, phaseOneTime, readPhaseOneRuntime,
  runPhaseOnePairedEvaluation, signPhaseOneVerificationReport, verifyPhaseOneVerificationReport,
  type PhaseOneCase, type PhaseOneComparison, type PhaseOneCriterion, type PhaseOneDataset,
  type PhaseOneEvaluator, type PhaseOneExposure, type PhaseOneJudgment, type PhaseOneRuntimeReader,
  type PhaseOneVerificationEnvelope, type Sha256Digest,
} from "@talent-signal/evaluation";
import { controllerBasename, controllerDirectory, writeControllerArtifact } from "./optimization/controllerFiles.js";
import { assertOptimizationControllerBinding, readOptimizationBudgetController } from "./optimization/controller.js";
import { eligiblePhaseOneJudgeAssurance, evaluatePhaseOneModelJudgment, type PhaseOneCalibratedJudgeAssurance,
  type PhaseOneJudgeRecording, type PhaseOneModelJudgeConfiguration } from "./phaseOneJudge.js";
import { assertPhaseOnePrivateSources, isPhaseOneSourceInvalidated } from "./phaseOneSources.js";
import type { OptimizationFeedbackBinding } from "./optimization/feedbackSource.js";
import { assertOptimizationLifecycleCurrent } from "./optimization/lifecycle.js";
import { runPhaseOneCIVerification, verifyPhaseOneCIProof, type PhaseOneCIProof } from "./phaseOneCI.js";
import { loadedRelationshipTaskConfiguration } from "@talent-signal/agent";
import {
  createOptimizationProductTaskAdapter, optimizationConfiguration, replayOptimizationProductTask,
  validateOptimizationCandidate, validateOptimizationRelationshipInput,
  type OptimizationDevExample, type ProductTaskRecording,
} from "./optimization/productTask.js";

/** This is host configuration, not an experiment artifact or worker input. */
export interface PhaseOneController {
  schemaVersion: "phase-one-controller.v1";
  runId: string;
  datasetId: string;
  generatorActorId: string;
  executorId: string;
  model: string;
  providerKind: "real_model" | "deterministic_fake";
  keyId: string;
  privateKeyFile: string;
  publicKeyFile: string;
  casesFile: string;
  exposuresFile: string;
  baselineFile: string;
  candidateFile: string;
  examplesFile: string;
  reviewsFile: string;
  reviewers: string[];
  environmentDigest: Sha256Digest;
  budgetDatasetDigest: Sha256Digest | null;
  semanticEvaluation: { kind: "human" } | PhaseOneModelJudgeConfiguration;
  sourceBindingsFile: string | null;
  sourceBackendURL: string | null;
  repetitions: number;
  seed: number;
  expiresAt: string;
}

const CONTROLLER_KEYS = ["schemaVersion", "runId", "datasetId", "generatorActorId", "executorId", "model", "providerKind",
  "keyId", "privateKeyFile", "publicKeyFile", "casesFile", "exposuresFile", "baselineFile", "candidateFile", "examplesFile",
  "reviewsFile", "reviewers", "environmentDigest", "budgetDatasetDigest", "semanticEvaluation", "sourceBindingsFile", "sourceBackendURL", "repetitions", "seed", "expiresAt"];
export const PHASE_ONE_CRITERIA: readonly PhaseOneCriterion[] = Object.freeze([
  { criterionId: "relationship.output_boundary", category: "deterministic_boundary", evaluatorId: "relationship-boundary.v1", evaluatorKind: "deterministic", critical: true },
  { criterionId: "relationship.evidence_and_usefulness", category: "semantic_quality", evaluatorId: "controller-human-review.v1", evaluatorKind: "human", critical: true },
]);
export const PHASE_ONE_RUBRIC_DIGEST = digestCanonicalJson({ version: "relationship-independent-rubric.v1", criteria: PHASE_ONE_CRITERIA,
  semanticRule: "Judge the actual answer against frozen source, identity, time, ambiguity, authorization and useful next step. A preference or later outcome is not factual gold." });

function object(value: unknown): Record<string, unknown> {
  phaseOneAssert(value && typeof value === "object" && !Array.isArray(value), "PHASE_ONE_CONTROLLER_INVALID");
  return value as Record<string, unknown>;
}

/** Sensitive gold, output, signing keys, and controller inputs never live in a worker-writable directory. */
function privateDirectory(path: string): string {
  const directory = controllerDirectory(path), stat = lstatSync(directory);
  phaseOneAssert((stat.mode & 0o077) === 0 && (process.getuid === undefined || stat.uid === process.getuid()), "PHASE_ONE_CONTROLLER_PERMISSIONS_REQUIRED");
  return directory;
}

function privateText(directory: string, name: string): string {
  const fd = openSync(join(directory, controllerBasename(name)), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    phaseOneAssert(stat.isFile() && stat.size <= 5_000_000 && (stat.mode & 0o077) === 0
      && (process.getuid === undefined || stat.uid === process.getuid()), "PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}

function privateJson(directory: string, name: string): unknown { return JSON.parse(privateText(directory, name)); }

function loadController(directory: string): PhaseOneController {
  const raw = object(privateJson(directory, "phase-one-controller.json"));
  phaseOneAssert(Object.keys(raw).length === CONTROLLER_KEYS.length && CONTROLLER_KEYS.every(key => Object.hasOwn(raw, key)), "PHASE_ONE_CONTROLLER_INVALID");
  phaseOneAssert(raw.schemaVersion === "phase-one-controller.v1" && ["real_model", "deterministic_fake"].includes(String(raw.providerKind)), "PHASE_ONE_CONTROLLER_INVALID");
  for (const name of ["runId", "datasetId", "generatorActorId", "executorId", "model", "keyId"]) phaseOneId(raw[name]);
  for (const name of CONTROLLER_KEYS.filter(key => key.endsWith("File"))) if (name !== "sourceBindingsFile" || raw[name] !== null) controllerBasename(raw[name]);
  phaseOneAssert(raw.sourceBackendURL === null || typeof raw.sourceBackendURL === "string", "PHASE_ONE_SOURCE_BACKEND_INVALID");
  const filenames = CONTROLLER_KEYS.filter(key => key.endsWith("File")).map(key => raw[key]).filter(value => value !== null);
  phaseOneAssert(new Set(filenames).size === filenames.length, "PHASE_ONE_CONTROLLER_FILE_ALIAS_REJECTED");
  phaseOneAssert(Array.isArray(raw.reviewers) && new Set(raw.reviewers).size === raw.reviewers.length, "PHASE_ONE_REVIEWERS_INVALID");
  raw.reviewers.forEach(phaseOneId);
  phaseOneAssert(raw.executorId !== raw.generatorActorId && !raw.reviewers.includes(raw.executorId)
    && !raw.reviewers.includes(raw.generatorActorId), "PHASE_ONE_EXECUTOR_NOT_INDEPENDENT");
  phaseOneAssert(typeof raw.expiresAt === "string" && phaseOneTime(raw.expiresAt) > Date.now(), "PHASE_ONE_CONTROLLER_EXPIRED");
  const semantic = object(raw.semanticEvaluation);
  phaseOneAssert(semantic.kind === "human" || semantic.kind === "model", "PHASE_ONE_SEMANTIC_CONFIGURATION_INVALID");
  if (semantic.kind === "model") {
    phaseOneId(semantic.evaluatorId); phaseOneId(semantic.model); controllerBasename(semantic.assuranceFile);
    phaseOneAssert(semantic.evaluatorId !== raw.executorId && semantic.evaluatorId !== raw.generatorActorId, "PHASE_ONE_EXECUTOR_NOT_INDEPENDENT");
  }
  return raw as unknown as PhaseOneController;
}

function keys(directory: string, config: PhaseOneController) {
  const privateKeyPem = privateText(directory, config.privateKeyFile), publicKeyPem = privateText(directory, config.publicKeyFile);
  const probe = Buffer.from("phase-one-key-pair-check.v1");
  phaseOneAssert(verify(null, probe, publicKeyPem, sign(null, probe, privateKeyPem)), "PHASE_ONE_KEY_PAIR_MISMATCH");
  return { signer: { keyId: config.keyId, executorId: config.executorId, privateKeyPem },
    trusted: [{ keyId: config.keyId, executorId: config.executorId, publicKeyPem }] };
}

function study(directory: string, config: PhaseOneController) {
  const allCases = privateJson(directory, config.casesFile) as PhaseOneCase[];
  const exposures = privateJson(directory, config.exposuresFile) as PhaseOneExposure[];
  phaseOneAssert(Array.isArray(allCases) && allCases.length <= 500 && Array.isArray(exposures), "PHASE_ONE_CASES_INVALID");
  // The controller owns the complete study, including dev source groups. Validate before selecting final cases.
  const universe = freezePhaseOneDataset({ datasetId: `${config.datasetId}:study`, cases: allCases, exposures });
  for (const item of allCases) {
    const input = validateOptimizationRelationshipInput(item.modelInput);
    phaseOneAssert(config.providerKind !== "deterministic_fake" || input.dataClass === "synthetic", "PHASE_ONE_FIXTURE_REQUIRES_SYNTHETIC_DATA");
  }
  const cases = allCases.filter(item => item.purpose === "final_verification" && item.sourcePartition !== "dev");
  const dataset = freezePhaseOneDataset({ datasetId: config.datasetId, cases, exposures });
  phaseOneAssert(dataset.cases.every(item => item.currentPurpose === "final_verification"), "PHASE_ONE_FINAL_DATA_EXPOSED_OR_DEVELOPMENT");
  phaseOneAssert(["p0", "held_out", "red_team"].every(partition => dataset.cases.some(item => item.sourcePartition === partition)), "PHASE_ONE_RELEASE_PARTITION_COVERAGE_MISSING");
  return { universe, cases, exposures, dataset };
}

export interface FrozenStudy {
  schemaVersion: "phase-one-frozen-study.v1";
  controllerDigest: Sha256Digest;
  studyDigest: Sha256Digest;
  sourceBindingsDigest: Sha256Digest;
  buildEvidence: PhaseOneCIProof | null;
  dataset: PhaseOneDataset;
  comparison: PhaseOneComparison;
}

function freezeStudy(directory: string, config: PhaseOneController): FrozenStudy {
  const source = study(directory, config);
  const examples = privateJson(directory, config.examplesFile) as OptimizationDevExample[];
  const baseline = optimizationConfiguration(config.model, validateOptimizationCandidate(privateJson(directory, config.baselineFile), examples), examples);
  const candidate = optimizationConfiguration(config.model, validateOptimizationCandidate(privateJson(directory, config.candidateFile), examples), examples);
  const buildEvidence = config.providerKind === "real_model"
    ? verifyPhaseOneCIProof(privateJson(directory, "phase-one-ci-proof.json") as PhaseOneCIProof, keys(directory, config).trusted) : null;
  if (buildEvidence) phaseOneAssert(loadedRelationshipTaskConfiguration(config.model).taskConfigurationDigest === digestCanonicalJson(candidate), "PHASE_ONE_CANDIDATE_SOURCE_NOT_LOADED_FOR_VERIFICATION");
  return { schemaVersion: "phase-one-frozen-study.v1", controllerDigest: digestCanonicalJson(config), studyDigest: source.universe.contentDigest,
    sourceBindingsDigest: digestCanonicalJson(config.sourceBindingsFile ? privateJson(directory, config.sourceBindingsFile) : []),
    buildEvidence,
    dataset: source.dataset, comparison: freezePhaseOneComparison({ runId: config.runId, generatorActorId: config.generatorActorId,
      datasetDigest: source.dataset.contentDigest, rubricDigest: digestCanonicalJson({ rubric: PHASE_ONE_RUBRIC_DIGEST, semanticEvaluation: config.semanticEvaluation }),
      environmentDigest: digestCanonicalJson({ declaredEnvironmentDigest: config.environmentDigest, buildEvidenceDigest: buildEvidence ? digestCanonicalJson(buildEvidence) : null }),
      baseline, candidate, repetitions: config.repetitions, seed: config.seed, criteria: PHASE_ONE_CRITERIA.map(criterion => criterion.category === "semantic_quality" && config.semanticEvaluation.kind === "model"
        ? { ...criterion, evaluatorKind: "model", evaluatorId: config.semanticEvaluation.evaluatorId } : criterion) }) };
}

function currentFrozen(directory: string, config: PhaseOneController): FrozenStudy {
  const saved = privateJson(directory, "phase-one-frozen.json") as FrozenStudy;
  const current = freezeStudy(directory, config);
  phaseOneAssert(digestCanonicalJson(saved) === digestCanonicalJson(current), "PHASE_ONE_FROZEN_STUDY_STALE");
  return current;
}

interface HumanReview {
  caseId: string;
  repetition: number;
  outputDigest: Sha256Digest;
  comparisonDigest: Sha256Digest;
  rubricDigest: Sha256Digest;
  reviewerId: string;
  decisionRef: string;
  status: "pass" | "fail";
  evidenceRefs: string[];
  revokedAt: string | null;
}

export function phaseOneJudgmentContext(config: PhaseOneController, read: (name: string) => unknown): { digest: Sha256Digest; assurance: unknown } {
  const assurance = config.semanticEvaluation.kind === "model" ? read(config.semanticEvaluation.assuranceFile) : null;
  return { digest: digestCanonicalJson({ reviews: config.semanticEvaluation.kind === "human" ? read(config.reviewsFile) : null, assurance }), assurance };
}

function evaluator(directory: string, config: PhaseOneController, frozen: FrozenStudy,
  judgeModel: (input: Parameters<PhaseOneEvaluator["evaluate"]>[0]) => Promise<PhaseOneJudgment>): PhaseOneEvaluator {
  return { async evaluate(input) {
    const source = validateOptimizationRelationshipInput(input.modelInput), output = object(input.output);
    const citations = output.citation_ids;
    const valid = ["answer", "question_set", "clarification"].includes(String(output.kind))
      && typeof output.title === "string" && output.title.trim().length > 0 && output.title.length <= 160
      && typeof output.body === "string" && output.body.trim().length > 0 && output.body.length <= 4000
      && Array.isArray(citations) && citations.length <= 20 && new Set(citations).size === citations.length
      && citations.every(id => typeof id === "string" && source.allowed_citation_ids.includes(id))
      && (output.kind === "clarification" || source.permits_unconfirmed_session_context_answer === true || citations.length > 0);
    const judgments: PhaseOneJudgment[] = [{ criterionId: "relationship.output_boundary", status: valid ? "pass" : "fail",
      evidenceRefs: [`output:${digestCanonicalJson(input.output)}`] }];
    if (config.semanticEvaluation.kind === "model") { judgments.push(await judgeModel(input)); return judgments; }
    const reviews = privateJson(directory, config.reviewsFile) as HumanReview[];
    phaseOneAssert(Array.isArray(reviews) && reviews.length <= 10000, "PHASE_ONE_HUMAN_REVIEW_INVALID");
    const matching = reviews.filter(review => review.caseId === input.caseId && review.repetition === input.repetition
      && review.outputDigest === digestCanonicalJson(input.output) && review.comparisonDigest === frozen.comparison.contentDigest
      && review.rubricDigest === frozen.comparison.rubricDigest && config.reviewers.includes(review.reviewerId) && review.revokedAt === null);
    if (matching.length === 1 && ["pass", "fail"].includes(matching[0]!.status)) {
      const review = matching[0]!;
      judgments.push({ criterionId: "relationship.evidence_and_usefulness", status: review.status, evidenceRefs: review.evidenceRefs,
        humanReviewerId: review.reviewerId, humanDecisionRef: review.decisionRef });
    } else judgments.push({ criterionId: "relationship.evidence_and_usefulness", status: "needs_review", evidenceRefs: [] });
    return judgments;
  } };
}

interface ExecutionJournal {
  schemaVersion: "phase-one-execution-journal.v1";
  comparisonDigest: Sha256Digest;
  studyDigest: Sha256Digest;
  executorId: string;
  keyId: string;
  records: Array<{ recordedAt: string; recording: ProductTaskRecording }>;
  judgeRecords: PhaseOneJudgeRecording[];
  signature: string;
}

function journalPayload(journal: ExecutionJournal) { const { signature: _signature, ...payload } = journal; return payload; }
function readJournal(directory: string, config: PhaseOneController, frozen: FrozenStudy, publicKeyPem: string): ExecutionJournal | null {
  let journal: ExecutionJournal;
  try { journal = privateJson(directory, "phase-one-executions.json") as ExecutionJournal; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  phaseOneAssert(journal.schemaVersion === "phase-one-execution-journal.v1" && journal.comparisonDigest === frozen.comparison.contentDigest
    && journal.studyDigest === frozen.studyDigest && journal.executorId === config.executorId && journal.keyId === config.keyId
    && Array.isArray(journal.records) && journal.records.length <= 10000 && Array.isArray(journal.judgeRecords) && journal.judgeRecords.length <= 10000
    && verify(null, Buffer.from(canonicalJson(journalPayload(journal))), publicKeyPem, Buffer.from(journal.signature, "base64")), "PHASE_ONE_EXECUTION_JOURNAL_INVALID");
  phaseOneAssert(new Set(journal.records.map(item => item.recording.requestDigest)).size === journal.records.length, "PHASE_ONE_EXECUTION_RECORD_DUPLICATE");
  return journal;
}

function assertNotTombstoned(directory: string): void {
  try { privateText(directory, "phase-one-tombstone.json"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("PHASE_ONE_RUN_TOMBSTONED");
}

/** Serializes artifact writes and deletion across processes; SQLite releases crash-left locks. */
function artifactTransaction(directory: string, mutate: () => void, tombstone = false, allowTombstoned = false): void {
  const path = join(directory, "phase-one-artifacts.sqlite");
  const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  closeSync(fd);
  const db = new DatabaseSync(path, { timeout: 5000, allowExtension: false });
  try {
    db.exec("PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS artifact_control (id INTEGER PRIMARY KEY CHECK (id = 1), tombstoned INTEGER NOT NULL); INSERT OR IGNORE INTO artifact_control VALUES (1, 0); BEGIN IMMEDIATE");
    try {
      const state = db.prepare("SELECT tombstoned FROM artifact_control WHERE id = 1").get();
      phaseOneAssert(tombstone || allowTombstoned || state?.tombstoned === 0, "PHASE_ONE_RUN_TOMBSTONED");
      if (tombstone) db.exec("UPDATE artifact_control SET tombstoned = 1 WHERE id = 1");
      else if (!allowTombstoned) assertNotTombstoned(directory);
      mutate();
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

/** Same-host single executor; only a proved dead PID releases a crash-left lease. */
function acquireExecutionLeaseUnlocked(directory: string): () => void {
  const path = join(directory, "phase-one-executor.lock"), temporary = join(directory, `phase-one-lease-${randomUUID()}.tmp`);
  const fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid }), "utf8"); fsyncSync(fd); }
  finally { closeSync(fd); }
  try {
    try { linkSync(temporary, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = lstatSync(path), owner = object(JSON.parse(privateText(directory, "phase-one-executor.lock")));
      phaseOneAssert(Number.isSafeInteger(owner.pid) && Number(owner.pid) > 0, "PHASE_ONE_EXECUTOR_LOCK_INVALID");
      try { process.kill(Number(owner.pid), 0); throw new Error("PHASE_ONE_EXECUTOR_ALREADY_RUNNING"); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ESRCH") throw probe; }
      const current = lstatSync(path);
      phaseOneAssert(current.ino === stat.ino && current.dev === stat.dev, "PHASE_ONE_EXECUTOR_LOCK_CHANGED");
      unlinkSync(path); linkSync(temporary, path);
    }
    const owned = lstatSync(path);
    return () => {
      try { const current = lstatSync(path); if (current.ino === owned.ino && current.dev === owned.dev) unlinkSync(path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    };
  } finally { unlinkSync(temporary); }
}

function acquireExecutionLease(directory: string): () => void {
  let release: (() => void) | undefined;
  artifactTransaction(directory, () => { release = acquireExecutionLeaseUnlocked(directory); });
  return () => artifactTransaction(directory, () => release?.(), false, true);
}

function erasePhaseOnePrivateCopies(directory: string): void {
  const raw = object(privateJson(directory, "phase-one-controller.json"));
  for (const field of ["casesFile", "examplesFile"] as const) {
    const name = controllerBasename(raw[field]), contents = privateJson(directory, name);
    if (Array.isArray(contents) && contents.some(item => field === "casesFile" ? item?.modelInput?.dataClass === "private_business" : item?.dataClass === "private_business")) {
      writeControllerArtifact(directory, name, { schemaVersion: "phase-one-private-copy-tombstone.v1", previousDigest: digestCanonicalJson(contents), reason: "source_or_run_tombstoned" });
    }
    for (const temporary of readdirSync(directory).filter(file => file.startsWith(`${name}.`) && file.endsWith(".tmp"))) unlinkSync(join(directory, temporary));
  }
  const reviewsFile = controllerBasename(raw.reviewsFile);
  writeControllerArtifact(directory, reviewsFile, []);
  for (const temporary of readdirSync(directory).filter(file => file.startsWith(`${reviewsFile}.`) && file.endsWith(".tmp"))) unlinkSync(join(directory, temporary));
}

/** Called by the optimizer's zero-paid lifecycle maintainer, including while no experiment is running. */
export async function sweepPhaseOneControllerSources(path: string, dependencies: { backendToken?: string; sourceFetcher?: typeof fetch } = {}): Promise<{ status: string }> {
  const directory = privateDirectory(path);
  try { privateJson(directory, "phase-one-controller.json"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "not_configured" }; throw error; }
  try { assertNotTombstoned(directory); }
  catch { return { status: "tombstoned" }; }
  try {
    const config = loadController(directory);
    await assertPhaseOnePrivateSources({ cases: privateJson(directory, config.casesFile) as PhaseOneCase[],
      examples: privateJson(directory, config.examplesFile) as OptimizationDevExample[],
      bindings: config.sourceBindingsFile ? privateJson(directory, config.sourceBindingsFile) as OptimizationFeedbackBinding[] : [],
      baseURL: config.sourceBackendURL, token: dependencies.backendToken ?? process.env.TALENT_SIGNAL_PHASE_ONE_SOURCE_TOKEN }, dependencies.sourceFetcher);
    return { status: "current" };
  } catch (error) {
    if (isPhaseOneSourceInvalidated(error) || error instanceof Error && error.message === "PHASE_ONE_CONTROLLER_EXPIRED") {
      await runPhaseOneCommand(["tombstone"], directory); return { status: "tombstoned" };
    }
    throw error;
  }
}

/** Runs in the controller's CLI process; the generator worker never receives keys or final inputs. */
export async function runPhaseOneCommand(argv: readonly string[], path: string): Promise<unknown> {
  const releaseCommands = ["rollback-baseline", "rollback-candidate", "rollback-restored", "release-review", "release-readback", "release-inspect"];
  phaseOneAssert(argv.length === 1 && ["ci-verify", "freeze", "verify", "adjudicate", "inspect", "tombstone", ...releaseCommands].includes(argv[0]!), "PHASE_ONE_COMMAND_INVALID");
  const directory = privateDirectory(path), command = argv[0]!;
  if (command === "tombstone") {
    artifactTransaction(directory, () => {
      writeControllerArtifact(directory, "phase-one-tombstone.json", { schemaVersion: "phase-one-tombstone.v1", recordedAt: new Date().toISOString(), releaseAuthority: "none" });
      const files = readdirSync(directory).filter(name => /^(?:phase-one-executions|phase-one-verification)\.json(?:\.[0-9a-f-]+\.tmp)?$/.test(name));
      for (const file of files) {
        try { unlinkSync(join(directory, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      erasePhaseOnePrivateCopies(directory);
    }, true);
    // Stop any in-flight paid final calls using the same original budget run.
    let budget: ReturnType<typeof readOptimizationBudgetController> | null = null;
    try {
      const raw = object(privateJson(directory, "phase-one-controller.json"));
      if (raw.providerKind === "real_model" && typeof raw.runId === "string") {
        budget = readOptimizationBudgetController(directory, raw.runId); budget.ledger.tombstone(raw.runId);
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    finally { budget?.ledger.close(); }
    return { status: "tombstoned", releaseAuthority: "none" };
  }
  assertNotTombstoned(directory);
  const config = loadController(directory), key = keys(directory, config);
  const validateSources = async (currentCaseId?: string, requireLifecycle = false) => {
    try {
      const cases = privateJson(directory, config.casesFile) as PhaseOneCase[], examples = privateJson(directory, config.examplesFile) as OptimizationDevExample[];
      if (requireLifecycle && (cases.some(item => (item.modelInput as { dataClass?: string }).dataClass === "private_business")
        || examples.some(item => item.dataClass === "private_business"))) assertOptimizationLifecycleCurrent(directory);
      await assertPhaseOnePrivateSources({ cases, examples,
        bindings: config.sourceBindingsFile ? privateJson(directory, config.sourceBindingsFile) as OptimizationFeedbackBinding[] : [],
        baseURL: config.sourceBackendURL, token: process.env.TALENT_SIGNAL_PHASE_ONE_SOURCE_TOKEN, ...(currentCaseId ? { currentCaseId } : {}) });
    } catch (error) {
      if (isPhaseOneSourceInvalidated(error)) await runPhaseOneCommand(["tombstone"], directory);
      throw error;
    }
  };
  await validateSources();
  if (command === "ci-verify") {
    const proof = runPhaseOneCIVerification(key.signer, (id, text) => artifactTransaction(directory, () =>
      writeControllerArtifact(directory, `phase-one-ci-diagnostic-${id}.json`, { check: id, output: text })));
    artifactTransaction(directory, () => writeControllerArtifact(directory, "phase-one-ci-proof.json", proof));
    return { status: "ci_verified", sourceDigest: proof.sourceDigest, runtimeBuildDigest: proof.runtimeBuildDigest,
      applicationRevision: proof.applicationRevision, semanticQuality: "not_run", releaseAuthority: "none" };
  }
  if (command === "freeze") {
    const frozen = freezeStudy(directory, config);
    try {
      const existing = privateJson(directory, "phase-one-frozen.json");
      phaseOneAssert(digestCanonicalJson(existing) === digestCanonicalJson(frozen), "PHASE_ONE_FROZEN_STUDY_IMMUTABLE");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    artifactTransaction(directory, () => writeControllerArtifact(directory, "phase-one-frozen.json", frozen));
    return { status: "frozen", studyDigest: frozen.studyDigest, datasetDigest: frozen.dataset.contentDigest, comparisonDigest: frozen.comparison.contentDigest, releaseAuthority: "none" };
  }
  const frozen = currentFrozen(directory, config);
  if (releaseCommands.includes(command)) {
    const { runPhaseOneReleaseCommand } = await import("./phaseOneReleaseCommand.js");
    return runPhaseOneReleaseCommand(command, { directory, config, frozen, verificationKeys: key, validateSources,
      readJson: name => privateJson(directory, name), readText: name => privateText(directory, name),
      write: (name, value) => artifactTransaction(directory, () => { currentFrozen(directory, config); writeControllerArtifact(directory, name, value); }) });
  }
  if (command === "inspect") {
    const envelope = privateJson(directory, "phase-one-verification.json") as PhaseOneVerificationEnvelope;
    const report = verifyPhaseOneVerificationReport(envelope, key.trusted);
    phaseOneAssert(report.comparisonDigest === frozen.comparison.contentDigest, "PHASE_ONE_VERIFICATION_BINDING_MISMATCH");
    phaseOneAssert(report.judgmentContextDigest === phaseOneJudgmentContext(config, name => privateJson(directory, name)).digest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    return { status: "verified_signature", reportDigest: report.contentDigest, categories: report.categories,
      candidate: report.candidate, paired: report.paired, cost: report.cost, releaseAuthority: "none" };
  }
  const source = study(directory, config), examples = privateJson(directory, config.examplesFile) as OptimizationDevExample[];
  const releaseLease = acquireExecutionLease(directory);
  try {
  const journal = readJournal(directory, config, frozen, key.trusted[0]!.publicKeyPem) ?? {
    schemaVersion: "phase-one-execution-journal.v1" as const, comparisonDigest: frozen.comparison.contentDigest,
    studyDigest: frozen.studyDigest, executorId: config.executorId, keyId: config.keyId, records: [], judgeRecords: [], signature: "",
  };
  const judgmentContext = phaseOneJudgmentContext(config, name => privateJson(directory, name));
  let liveCalls = 0, replayedCalls = 0, activeCaseId: string | undefined;
  const onRecording = async (recording: ProductTaskRecording) => {
    await validateSources(activeCaseId, true);
    assertNotTombstoned(directory); currentFrozen(directory, config);
    journal.records.push({ recordedAt: new Date().toISOString(), recording });
    journal.signature = sign(null, Buffer.from(canonicalJson(journalPayload(journal))), key.signer.privateKeyPem).toString("base64");
    const write = () => artifactTransaction(directory, () => writeControllerArtifact(directory, "phase-one-executions.json", journal));
    if (budget) budget.ledger.withRunArtifactWrite(config.runId, write); else write();
  };
  const budget = config.providerKind === "real_model" && command === "verify" ? readOptimizationBudgetController(directory, config.runId) : null;
  const budgetOwner = randomUUID(), cancellation = new AbortController();
  let ownsBudget = false, polling: ReturnType<typeof setInterval> | undefined;
  try {
    if (budget) {
      budget.ledger.acquireRunController(config.runId, budgetOwner); ownsBudget = true;
      assertOptimizationControllerBinding(directory, budget.configuration, budget.run);
      phaseOneAssert(budget.model === config.model && budget.run.bindings.baselineDigest === digestCanonicalJson(frozen.comparison.baseline)
        && budget.run.bindings.datasetDigest === config.budgetDatasetDigest && budget.pricing && budget.run.permit, "PHASE_ONE_FINAL_BUDGET_BINDING_MISMATCH");
      const search = object(privateJson(directory, budget.configuration.searchFile));
      phaseOneAssert(digestCanonicalJson(search) === config.budgetDatasetDigest && Array.isArray(search.cases), "PHASE_ONE_SEARCH_BINDING_STALE");
      const allCases = privateJson(directory, config.casesFile) as PhaseOneCase[];
      for (const raw of search.cases) {
        const item = object(raw), match = allCases.find(value => value.caseId === item.caseId && value.sourcePartition === "dev");
        phaseOneAssert(match && digestCanonicalJson(match.modelInput) === digestCanonicalJson(item.modelInput)
          && match.referenceTime === item.referenceTime && digestCanonicalJson(match.oracle) === digestCanonicalJson(item.oracle), "PHASE_ONE_GLOBAL_SOURCE_STUDY_INCOMPLETE");
      }
      for (const binding of (search.feedbackSources as OptimizationFeedbackBinding[] | undefined) ?? []) {
        phaseOneAssert(!source.cases.some(item => item.sourceIds.includes(`feedback:${binding.feedbackId}`)
          || item.sourceIds.includes(`execution:${binding.executionId}`)), "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
      }
      const snapshot = budget.ledger.snapshot(config.runId);
      if (snapshot.status === "checkpointed" && snapshot.reason === "search_finished_pending_independent_validation") budget.ledger.resume(budget.run);
      phaseOneAssert(budget.ledger.snapshot(config.runId).status === "running", "PHASE_ONE_FINAL_BUDGET_NOT_RUNNING");
      polling = setInterval(() => {
        try { assertNotTombstoned(directory); if (budget.ledger.snapshot(config.runId).status !== "running") cancellation.abort(); }
        catch { cancellation.abort(); }
      }, 100);
    }
    const apiKey = process.env.TALENT_SIGNAL_PHASE_ONE_PROVIDER_API_KEY;
    phaseOneAssert(command !== "verify" || config.providerKind !== "real_model" || typeof apiKey === "string" && apiKey.trim(), "PHASE_ONE_PROVIDER_CREDENTIAL_UNAVAILABLE");
    const product = command === "adjudicate" ? null : config.providerKind === "real_model"
      ? createOptimizationProductTaskAdapter({ model: config.model, examples, onRecording, beforeDispatch: () => validateSources(activeCaseId, true), signal: cancellation.signal, providerKind: "real_model", apiKey: apiKey!,
        budget: { ledger: budget!.ledger, run: budget!.run, phase: "final_validation", pricing: budget!.pricing! } })
      : createOptimizationProductTaskAdapter({ model: config.model, examples, onRecording, providerKind: "deterministic_fake",
        fetcher: async () => new Response(JSON.stringify({ id: "phase-one-offline", model: config.model,
          choices: [{ message: { content: JSON.stringify({ kind: "clarification", title: "Clarify the evidence", body: "Which source and reference time should guide this answer?", citation_ids: [] }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 12 } }), { status: 200 }) });
    const judgeModel = async (input: Parameters<PhaseOneEvaluator["evaluate"]>[0]): Promise<PhaseOneJudgment> => {
      const unreviewed: PhaseOneJudgment = { criterionId: "relationship.evidence_and_usefulness", status: "needs_review", evidenceRefs: [] };
      if (config.semanticEvaluation.kind !== "model" || !eligiblePhaseOneJudgeAssurance(judgmentContext.assurance, config.semanticEvaluation, frozen.comparison.rubricDigest)) return unreviewed;
      const matchingDigest = digestCanonicalJson(input);
      const prior = journal.judgeRecords.find(item => item.inputDigest === matchingDigest && item.assuranceDigest === digestCanonicalJson(judgmentContext.assurance));
      if (prior) return prior.judgment;
      if (command === "adjudicate" || !budget || !apiKey || config.providerKind !== "real_model") return unreviewed;
      const result = await evaluatePhaseOneModelJudgment(input, { config: config.semanticEvaluation, assurance: judgmentContext.assurance,
        rubricDigest: frozen.comparison.rubricDigest, ledger: budget.ledger, run: budget.run, apiKey, signal: cancellation.signal, beforeDispatch: () => validateSources(input.caseId, true) });
      await validateSources(input.caseId, true);
      journal.judgeRecords.push({ ...result, inputDigest: matchingDigest });
      journal.signature = sign(null, Buffer.from(canonicalJson(journalPayload(journal))), key.signer.privateKeyPem).toString("base64");
      budget.ledger.withRunArtifactWrite(config.runId, () => artifactTransaction(directory, () => writeControllerArtifact(directory, "phase-one-executions.json", journal)));
      return result.judgment;
    };
    const assurances = config.semanticEvaluation.kind === "model" && eligiblePhaseOneJudgeAssurance(judgmentContext.assurance, config.semanticEvaluation, frozen.comparison.rubricDigest)
      ? [judgmentContext.assurance] : [];
    const report = await runPhaseOnePairedEvaluation({ comparison: frozen.comparison, dataset: frozen.dataset, judgmentContextDigest: judgmentContext.digest, judgeCosts: () => journal.judgeRecords.map(item => item.costUsd),
      cases: source.cases, exposures: source.exposures, executor: { executorId: config.executorId, async execute(request) {
        activeCaseId = request.caseId;
        assertNotTombstoned(directory); currentFrozen(directory, config);
        await validateSources(request.caseId, true);
        if (budget) assertOptimizationControllerBinding(directory, budget.configuration, budget.run);
        const prior = journal.records.find(item => item.recording.requestDigest === digestCanonicalJson(request));
        if (prior) { replayedCalls += 1; return replayOptimizationProductTask(prior.recording, request); }
        phaseOneAssert(product, "PHASE_ONE_RECORDED_EXECUTION_MISSING");
        liveCalls += 1;
        const receipt = await product.execute(request);
        await validateSources(request.caseId);
        return receipt;
      } }, evaluator: evaluator(directory, config, frozen, judgeModel), judgeAssurances: assurances, mode: "independent_verification", createdAt: new Date().toISOString() });
    assertNotTombstoned(directory); currentFrozen(directory, config);
    await validateSources();
    assertPhaseOneDatasetCurrent(frozen.dataset, study(directory, config).cases, study(directory, config).exposures);
    phaseOneAssert(phaseOneJudgmentContext(config, name => privateJson(directory, name)).digest === judgmentContext.digest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    const envelope = signPhaseOneVerificationReport(report, key.signer);
    const writeReport = () => artifactTransaction(directory, () => writeControllerArtifact(directory, "phase-one-verification.json", envelope));
    if (budget) budget.ledger.withRunArtifactWrite(config.runId, writeReport); else writeReport();
    return { status: "recorded", reportDigest: report.contentDigest, categories: report.categories, liveCalls, replayedCalls,
      cost: report.cost, releaseAuthority: "none" };
  } finally {
    if (polling) clearInterval(polling);
    if (budget) { try { if (ownsBudget) budget.ledger.releaseRunController(config.runId, budgetOwner); } finally { budget.ledger.close(); } }
  }
  } finally { releaseLease(); }
}

/** The URL and bearer are trusted host dependencies; there is no artifact-file readback fallback. */
export function createPhaseOneHttpRuntimeReader(input: { environments: Readonly<Record<string, { origin: string; deploymentId: string }>>;
  bearerToken: string; fetcher?: typeof fetch }): PhaseOneRuntimeReader {
  return { async readLoadedConfiguration(targetEnvironmentId) {
    const target = input.environments[targetEnvironmentId];
    phaseOneAssert(target && input.bearerToken.trim(), "PHASE_ONE_RUNTIME_CONFIGURATION_UNAVAILABLE");
    const origin = new URL(target.origin);
    phaseOneAssert(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/"
      && (origin.protocol === "https:" || origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)), "PHASE_ONE_RUNTIME_ORIGIN_INVALID");
    const response = await (input.fetcher ?? fetch)(new URL("/v1/lab/runtime-configuration", origin), {
      headers: { authorization: `Bearer ${input.bearerToken}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10000),
    });
    phaseOneAssert(response.ok, "PHASE_ONE_RUNTIME_READBACK_UNAVAILABLE");
    const text = await response.text();
    phaseOneAssert(text.length <= 100000, "PHASE_ONE_RUNTIME_READBACK_TOO_LARGE");
    const value = object(JSON.parse(text));
    phaseOneAssert(value.schema_version === "loaded-runtime-configuration.v1" && value.deployment_id === target.deploymentId
      && value.loading_policy === "bundled_at_startup" && value.in_flight_policy === "retain_captured_snapshot", "PHASE_ONE_RUNTIME_TARGET_MISMATCH");
    phaseOneAssert(value.deployment_exposure && digestCanonicalJson(value.deployment_exposure) === value.deployment_exposure_digest,
      "PHASE_ONE_DEPLOYMENT_EXPOSURE_NOT_ENFORCED");
    const readback = { targetEnvironmentId, runtimeDigest: value.prompt_catalogue_digest as Sha256Digest,
      taskConfigurationDigest: object(value.relationship_task).taskConfigurationDigest as Sha256Digest,
      buildSourceDigest: value.build_source_digest as Sha256Digest, deploymentExposureDigest: value.deployment_exposure_digest as Sha256Digest,
      applicationRevision: value.revision as string, processInstanceId: value.process_instance_id as string,
      configurationInitializedAt: value.configuration_initialized_at as string, observedAt: new Date().toISOString() };
    // Reuse strict receipt validation even when called directly by a controller adapter.
    await readPhaseOneRuntime(targetEnvironmentId, { async readLoadedConfiguration() { return readback; } });
    return readback;
  } };
}
