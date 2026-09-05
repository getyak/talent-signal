import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { LabJobSchema, LabRegressionExportSchema, type LabJob, type LabRegressionExport } from "@talent-signal/contracts";
import {
  type ContentIdentityV1, type EvaluationAttemptV1, type EvaluationScenarioDocumentV1,
  type EvaluationScoreV1, type Sha256Digest,
} from "./contracts.js";
import { digestCanonicalJson, withContentDigest } from "./digest.js";
import { evaluateCapabilityGates } from "./gates.js";

const VERSION = "lab-regression-consumer/1";
const hash = (value: unknown) => digestCanonicalJson(value).slice(7);
const active = new Set(["queued", "running", "cancelling"]);
if (!FormatRegistry.Has("uuid")) FormatRegistry.Set("uuid", (value) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value));

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

/** Validate both content and lineage before constructing any quality claim. */
export function validateLabRegressionConsumption(bundleValue: unknown, jobValue: unknown, now: string): {
  bundle: LabRegressionExport; job: LabJob; allowedCitations: string[];
} {
  requireCondition(Value.Check(LabRegressionExportSchema, bundleValue), "LAB_EXPORT_SCHEMA_INVALID");
  requireCondition(Value.Check(LabJobSchema, jobValue), "LAB_RUN_SCHEMA_INVALID");
  const bundle = bundleValue as LabRegressionExport, job = jobValue as LabJob;
  requireCondition(Number.isFinite(Date.parse(now)), "LAB_CONSUMPTION_TIME_INVALID");
  requireCondition(Date.parse(bundle.expires_at) > Date.parse(now) && Date.parse(job.expires_at) > Date.parse(now), "LAB_RECORD_EXPIRED");
  requireCondition(hash(bundle.snapshot) === bundle.content_hash && hash(job.definition) === job.definition_hash, "LAB_RECORD_HASH_MISMATCH");
  requireCondition(job.definition.regression_source?.id === bundle.id && job.definition.regression_source.content_hash === bundle.content_hash, "LAB_RUN_LINEAGE_MISMATCH");
  requireCondition(job.definition.task === (bundle.snapshot.task ?? "relationship_text"), "LAB_RUN_TASK_MISMATCH");
  requireCondition(!active.has(job.status), "LAB_RUN_NOT_TERMINAL");
  requireCondition(job.id !== bundle.snapshot.source_job_id && job.definition.cases.length === 1, "LAB_RERUN_REQUIRED");
  requireCondition(job.definition.reference_time === bundle.snapshot.reference_time && hash(job.definition.cases[0]) === hash(bundle.snapshot.case), "LAB_FROZEN_CASE_CHANGED");
  requireCondition(bundle.snapshot.source_attempt.case_id === bundle.snapshot.case.id, "LAB_SOURCE_ATTEMPT_MISMATCH");
  let input: { allowed_citation_ids?: unknown };
  try { input = JSON.parse(bundle.snapshot.case.input_json); } catch { throw new Error("LAB_INPUT_INVALID"); }
  requireCondition(input && hash(input) === bundle.snapshot.case.input_hash, "LAB_INPUT_HASH_MISMATCH");
  requireCondition(Array.isArray(input.allowed_citation_ids) && input.allowed_citation_ids.every((id) => typeof id === "string"), "LAB_CITATION_SET_INVALID");
  requireCondition(job.definition.configurations.length === 2 && Number.isInteger(job.definition.repetitions)
    && job.definition.repetitions >= 1 && job.definition.repetitions <= 3, "LAB_MATRIX_INVALID");
  const count = 2 * job.definition.repetitions;
  requireCondition(job.attempts.length === count && job.calls_reserved <= count, "LAB_ATTEMPT_COUNT_INVALID");
  const cells = new Set<string>(), ids = new Set<string>();
  for (const attempt of job.attempts) {
    const configuration = job.definition.configurations[attempt.configuration_index];
    requireCondition(configuration && attempt.case_id === bundle.snapshot.case.id && [0, 1].includes(attempt.configuration_index)
      && attempt.repetition >= 1 && attempt.repetition <= job.definition.repetitions, "LAB_ATTEMPT_BINDING_INVALID");
    requireCondition(configuration.model === attempt.requested_model && configuration.prompt_revision === attempt.prompt_revision, "LAB_ATTEMPT_CONFIGURATION_MISMATCH");
    const cell = `${attempt.configuration_index}:${attempt.repetition}`;
    requireCondition(!cells.has(cell) && !ids.has(attempt.id), "LAB_DUPLICATE_ATTEMPT");
    cells.add(cell); ids.add(attempt.id);
  }
  return { bundle, job, allowedCitations: input.allowed_citation_ids as string[] };
}

/** Consume a completed product rerun; this adapter does not call a model or grant release authority. */
export function consumeLabRegression(input: {
  bundle: unknown; job: unknown; now: string;
  runner: { git_sha: string; source_digest: Sha256Digest };
  transport: "authenticated_backend_readback" | "reviewed_local_files";
}) {
  const { bundle, job, allowedCitations } = validateLabRegressionConsumption(input.bundle, input.job, input.now);
  const identity = (identityId: string, version: string, content: unknown): ContentIdentityV1 => ({ identityId, version, contentDigest: digestCanonicalJson(content) });
  const id = `lab-regression-${bundle.id}`;
  const fixture = (name: string, content: unknown) => ({ fixtureId: `${id}-${name}`, path: `lab/${bundle.content_hash}/${name}.json`, contentDigest: digestCanonicalJson(content) });
  const evaluator = identity("lab-record-integrity", VERSION, { version: VERSION, source: input.runner.source_digest });
  const scenario = withContentDigest<Omit<EvaluationScenarioDocumentV1, "contentDigest">>({
    schemaVersion: "evaluation-scenario.v1", scenarioId: id, revision: bundle.content_hash,
    title: "Saved Lab regression", purpose: "Check the integrity of a frozen product rerun and preserve unresolved semantic review.",
    suiteIds: ["lab-saved-regressions"], riskTier: "p1_core", lifecycle: "draft", adjudication: "unreviewed",
    // An inspected failure is development evidence, even if its original case came from a held-out partition.
    partition: "dev", compatibleProfileIds: ["lab-product-run-readback"], criterionAdjudications: [],
    dataPolicy: { dataClass: "synthetic_restricted", containsRealCandidateData: false, projection: "metadata_only" },
    modelInputRef: fixture("input", JSON.parse(bundle.snapshot.case.input_json)), initialStateRef: fixture("context", { reference_time: bundle.snapshot.reference_time }),
    oracleRef: fixture("review", { expected: bundle.snapshot.expected_behavior, note: bundle.snapshot.review_note }),
    evaluatorBindings: [{ evaluatorId: evaluator.identityId, version: evaluator.version, contentDigest: evaluator.contentDigest,
      kind: "deterministic", criterionIds: ["integrity.execution", "integrity.configuration", "integrity.output", "integrity.citations"], requiredForGate: true },
    { evaluatorId: "lab-semantic-review", version: "1", contentDigest: digestCanonicalJson({ version: 1 }), kind: "human", criterionIds: ["quality.expected_behavior"], requiredForGate: true }],
    slices: { source_partition: bundle.snapshot.case.partition },
    lineage: { sourceKind: "governed_case_proposal", sourceIds: [bundle.id, bundle.snapshot.source_job_id, bundle.snapshot.source_attempt.id] },
  });
  const results = job.attempts.map((record) => {
    const configuration = job.definition.configurations[record.configuration_index]!;
    const attempt = withContentDigest<Omit<EvaluationAttemptV1, "contentDigest">>({
      schemaVersion: "evaluation-attempt.v1", attemptId: record.id,
      scenario: { identityId: id, version: bundle.content_hash, contentDigest: scenario.contentDigest },
      profile: identity("lab-product-run-readback", VERSION, { job: job.definition_hash, adapter: VERSION }),
      agentDefinition: { definitionId: job.definition.instrument_revision, version: job.definition.backend_revision ?? "unreported", contentDigest: digestCanonicalJson(job.definition) },
      trialNumber: record.repetition, gitSha: job.definition.backend_revision ?? "unreported", systemUnderTest: ["agent_policy"], frozenDependencies: [],
      fingerprints: {
        provider: identity("provider-receipt", "1", { request_id: record.provider_request_id }),
        model: identity(record.requested_model, record.actual_model ?? "unreported", { requested: record.requested_model, actual: record.actual_model }),
        prompt: identity(configuration.prompt_preset, configuration.prompt_revision, configuration),
        policy: identity("lab-no-business-tools", "1", { tools: job.definition.tool_access, writes: job.definition.business_write_count }),
        toolManifest: identity("lab-tool-access", "1", job.definition.tool_access),
        sdk: { identityId: "lab-consumer", version: VERSION, contentDigest: input.runner.source_digest },
        rubric: evaluator, exportPolicy: identity("lab-metadata-report", "1", { content: "excluded" }),
        context: identity(bundle.snapshot.case.id, bundle.snapshot.case.revision, JSON.parse(bundle.snapshot.case.input_json)),
      }, startedAt: record.started_at ?? job.created_at,
    });
    const completed = record.status === "completed";
    const unavailable = ["unknown", "pending", "dispatching", "cancelled"].includes(record.status);
    const verdict = (pass: boolean) => unavailable ? "not_run" as const : pass ? "pass" as const : "fail" as const;
    const checks = [
      ["execution", verdict(completed)],
      ["configuration", verdict(completed && record.actual_model === configuration.model && record.actual_prompt_revision === configuration.prompt_revision)],
      ["output", verdict(completed && Boolean(record.title?.trim()) && record.title!.length <= 1000 && Boolean(record.answer?.trim()) && record.answer!.length <= 16000 && record.checks.some((check) => check.id === "output_contract" && check.verdict === "pass"))],
      ["citations", verdict(completed && record.citation_ids.every((citation) => allowedCitations.includes(citation)))],
    ] as const;
    const scores: EvaluationScoreV1[] = checks.map(([criterion, status]) => ({
      schemaVersion: "evaluation-score.v1", scoreId: `${record.id}-${criterion}`, scenarioId: id, attemptId: record.id,
      capability: "integrity", criterionId: `integrity.${criterion}`, evaluatorId: evaluator.identityId, evaluatorVersion: evaluator.version,
      evaluatorKind: "deterministic", riskTier: "p1_core", status, gateAuthority: true, veto: status === "fail",
      evidence: [{ artifactId: `lab-job-${job.id}`, jsonPointer: `/attempts/${job.attempts.indexOf(record)}` }],
      reasonCode: status === "pass" ? "RECORDED_EXECUTION_CHECK_PASSED" : status === "not_run" ? "EXECUTION_UNAVAILABLE_OR_UNKNOWN" : "RECORDED_EXECUTION_CHECK_FAILED",
    }));
    // Historical preference/expected prose cannot adjudicate this newly generated answer.
    scores.push({ schemaVersion: "evaluation-score.v1", scoreId: `${record.id}-semantic-review`, scenarioId: id, attemptId: record.id,
      capability: "quality", criterionId: "quality.expected_behavior", evaluatorId: "lab-semantic-review", evaluatorVersion: "1",
      evaluatorKind: "human", riskTier: "p2_quality", status: "needs_review", gateAuthority: false, veto: false, evidence: [], reasonCode: "NEW_OUTPUT_REQUIRES_CONTENT_REVIEW" });
    const gate = evaluateCapabilityGates(scenario, attempt, scores, input.now);
    return { attempt_id: record.id, configuration_index: record.configuration_index, repetition: record.repetition,
      actual_model: record.actual_model, actual_prompt_revision: record.actual_prompt_revision, duration_ms: record.duration_ms,
      input_tokens: record.input_tokens, output_tokens: record.output_tokens, record_digest: digestCanonicalJson(record), gate };
  });
  return withContentDigest({
    schemaVersion: "lab-regression-consumption.v1", regression_id: bundle.id, regression_content_hash: bundle.content_hash,
    source_case_id: bundle.snapshot.case.id, input_hash: bundle.snapshot.case.input_hash,
    source_partition: bundle.snapshot.case.partition, evaluation_partition: "dev", job_id: job.id, definition_hash: job.definition_hash,
    backend_revision: job.definition.backend_revision, instrument_revision: job.definition.instrument_revision,
    consumer_version: VERSION, runner: input.runner, transport: input.transport, consumed_at: input.now,
    execution: "previously_recorded_product_run", evaluation_scope: "record_integrity", new_model_calls: 0, release_authority: "none", ci_verification: "not_verified",
    content_policy: "metadata_only", record_expires_at: job.expires_at, results,
  });
}
