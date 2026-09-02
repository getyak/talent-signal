import type {
  ContentIdentityV1,
  EvaluationAttemptV1,
  DeletionReceiptV1,
  EvaluationExecutionProfileV1,
  EvaluationGateResultV1,
  EvaluationResultV1,
  EvaluationRunManifestV1,
  EvaluationScenarioDocumentV1,
  EvaluationScoreV1,
  EvaluationScenarioV1,
  EvaluationSuiteV1,
  FixtureReferenceV1,
  JsonValue,
  ProjectionReceiptV1,
  ScenarioInitialStateV1,
  ScenarioInitialStateFixtureV1,
  ScenarioModelInputV1,
  ScenarioModelInputFixtureV1,
  ScenarioOracleV1,
} from "./contracts.js";
import {
  ADJUDICATION_STATES,
  DATA_CLASSES,
  DATASET_PARTITIONS,
  EVALUATED_COMPONENTS,
  EXECUTION_MODES,
  LIFECYCLE_STATES,
  RISK_TIERS,
  GATE_STATUSES,
} from "./contracts.js";
import {
  collectAdjudicableCriterionIds,
  deriveScenarioAdjudication,
} from "./adjudication.js";
import { canonicalizeJson } from "./canonicalJson.js";
import { digestCanonicalJson, digestContentDocument, hasValidSha256Format } from "./digest.js";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export class EvaluationContractError extends Error {
  public readonly issues: ValidationIssue[];

  public constructor(label: string, issues: ValidationIssue[]) {
    super(`${label} is invalid: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "EvaluationContractError";
    this.issues = issues;
  }
}

interface ScenarioDocumentValidationOptions {
  allowMaterializedFields?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function requireRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    pushIssue(issues, "contract.type", path, "must be an object");
    return undefined;
  }
  return value;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, "contract.string", `${path}/${key}`, "must be a non-empty string");
    return undefined;
  }
  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): boolean | undefined {
  const value = record[key];
  if (typeof value !== "boolean") {
    pushIssue(issues, "contract.boolean", `${path}/${key}`, "must be a boolean");
    return undefined;
  }
  return value;
}

function requireInteger(
  record: Record<string, unknown>,
  key: string,
  minimum: number,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < minimum) {
    pushIssue(issues, "contract.integer", `${path}/${key}`, `must be an integer >= ${minimum}`);
    return undefined;
  }
  return value as number;
}

function requireArray(record: Record<string, unknown>, key: string, path: string, issues: ValidationIssue[]): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    pushIssue(issues, "contract.array", `${path}/${key}`, "must be an array");
    return [];
  }
  return value;
}

function ensureAllowedKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      pushIssue(issues, "contract.unknown_field", `${path}/${key}`, "is not allowed");
    }
  }
}

function ensureEnum(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    pushIssue(issues, "contract.enum", path, `must be one of ${allowed.join(", ")}`);
  }
}

function ensureUniqueStrings(values: unknown[], path: string, issues: ValidationIssue[], minimum = 0): string[] {
  const strings: string[] = [];
  values.forEach((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      pushIssue(issues, "contract.string", `${path}/${index}`, "must be a non-empty string");
      return;
    }
    strings.push(value);
  });
  if (strings.length < minimum) {
    pushIssue(issues, "contract.minimum_items", path, `must contain at least ${minimum} item(s)`);
  }
  if (new Set(strings).size !== strings.length) {
    pushIssue(issues, "contract.duplicate", path, "must not contain duplicates");
  }
  return strings;
}

function validateDigest(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!hasValidSha256Format(value)) {
    pushIssue(issues, "contract.digest", path, "must be sha256:<64 lowercase hex characters>");
  }
}

function validateRelativePath(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    pushIssue(issues, "contract.path", path, "must be a non-empty repository-relative path");
    return;
  }
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    pushIssue(issues, "contract.absolute_path", path, "must not be absolute");
  }
  if (value.split(/[\\/]/).includes("..")) {
    pushIssue(issues, "contract.path_traversal", path, "must not contain '..'");
  }
}

function validateContentIdentity(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecord(value, path, issues);
  if (record === undefined) return;
  ensureAllowedKeys(record, ["identityId", "version", "contentDigest"], path, issues);
  requireString(record, "identityId", path, issues);
  requireString(record, "version", path, issues);
  validateDigest(record.contentDigest, `${path}/contentDigest`, issues);
}

export function validateContentIdentityV1(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateContentIdentity(value, "$", issues);
  return { valid: issues.length === 0, issues };
}

function validateFixtureReference(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecord(value, path, issues);
  if (record === undefined) return;
  ensureAllowedKeys(record, ["fixtureId", "path", "contentDigest"], path, issues);
  requireString(record, "fixtureId", path, issues);
  validateRelativePath(record.path, `${path}/path`, issues);
  validateDigest(record.contentDigest, `${path}/contentDigest`, issues);
}

function validateScenarioLineage(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecord(value, path, issues);
  if (record === undefined) return;
  ensureAllowedKeys(
    record,
    ["sourceKind", "sourceIds", "previousRevision", "previousDigest", "authorizationRef"],
    path,
    issues,
  );
  ensureEnum(record.sourceKind, ["native", "legacy_adapter", "governed_case_proposal"], `${path}/sourceKind`, issues);
  ensureUniqueStrings(requireArray(record, "sourceIds", path, issues), `${path}/sourceIds`, issues, 1);
  if (record.previousRevision !== undefined) requireString(record, "previousRevision", path, issues);
  if (record.previousDigest !== undefined) validateDigest(record.previousDigest, `${path}/previousDigest`, issues);
  if ((record.previousRevision === undefined) !== (record.previousDigest === undefined)) {
    pushIssue(
      issues,
      "scenario.incomplete_lineage",
      path,
      "previousRevision and previousDigest must be declared together",
    );
  }
  if (record.authorizationRef !== undefined) requireString(record, "authorizationRef", path, issues);
  if (record.sourceKind === "governed_case_proposal" && record.authorizationRef === undefined) {
    pushIssue(
      issues,
      "scenario.authorization_required",
      `${path}/authorizationRef`,
      "is required for a governed case proposal",
    );
  }
}

function validateEvidenceLocator(value: unknown, path: string, issues: ValidationIssue[]): void {
  const locator = requireRecord(value, path, issues);
  if (locator === undefined) return;
  ensureAllowedKeys(locator, ["artifactId", "jsonPointer", "sourceRef"], path, issues);
  requireString(locator, "artifactId", path, issues);
  if (locator.jsonPointer !== undefined) requireString(locator, "jsonPointer", path, issues);
  if (locator.sourceRef !== undefined) requireString(locator, "sourceRef", path, issues);
}

function validateCriterionAdjudications(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Array<{ criterionId: string; status: string }> {
  const records = Array.isArray(value) ? value : [];
  if (!Array.isArray(value)) {
    pushIssue(issues, "contract.array", path, "must be an array");
  }
  const seen = new Set<string>();
  const valid: Array<{ criterionId: string; status: string }> = [];
  records.forEach((item, index) => {
    const itemPath = `${path}/${index}`;
    const record = requireRecord(item, itemPath, issues);
    if (record === undefined) return;
    ensureAllowedKeys(
      record,
      ["criterionId", "status", "evidence", "reviewerId", "decisionId", "decidedAt"],
      itemPath,
      issues,
    );
    const criterionId = requireString(record, "criterionId", itemPath, issues);
    ensureEnum(record.status, ADJUDICATION_STATES, `${itemPath}/status`, issues);
    const evidence = requireArray(record, "evidence", itemPath, issues);
    evidence.forEach((locator, locatorIndex) =>
      validateEvidenceLocator(locator, `${itemPath}/evidence/${locatorIndex}`, issues));
    if (criterionId !== undefined) {
      if (seen.has(criterionId)) {
        pushIssue(issues, "adjudication.duplicate_criterion", `${itemPath}/criterionId`, "must be unique");
      }
      seen.add(criterionId);
      if (typeof record.status === "string") valid.push({ criterionId, status: record.status });
    }
    if (record.status === "human_gold" || record.status === "disputed") {
      requireString(record, "reviewerId", itemPath, issues);
      requireString(record, "decisionId", itemPath, issues);
      const decidedAt = requireString(record, "decidedAt", itemPath, issues);
      if (decidedAt !== undefined && Number.isNaN(Date.parse(decidedAt))) {
        pushIssue(issues, "contract.date_time", `${itemPath}/decidedAt`, "must be an ISO date-time");
      }
      if (evidence.length === 0) {
        pushIssue(
          issues,
          "adjudication.evidence_required",
          `${itemPath}/evidence`,
          "human_gold and disputed decisions require atomic evidence",
        );
      }
    } else if (record.status === "unreviewed") {
      if (record.reviewerId !== undefined || record.decisionId !== undefined || record.decidedAt !== undefined) {
        pushIssue(
          issues,
          "adjudication.unreviewed_authority",
          itemPath,
          "unreviewed criteria cannot carry reviewer authority",
        );
      }
      if (evidence.length > 0) {
        pushIssue(
          issues,
          "adjudication.unreviewed_evidence",
          `${itemPath}/evidence`,
          "unreviewed criteria cannot imply adjudicated evidence",
        );
      }
    }
  });
  return valid;
}

function validateScenarioDocumentInternal(
  value: unknown,
  options: ScenarioDocumentValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(value, "$", issues);
  if (record === undefined) return issues;

  const allowed = [
    "schemaVersion",
    "scenarioId",
    "revision",
    "contentDigest",
    "title",
    "purpose",
    "suiteIds",
    "riskTier",
    "lifecycle",
    "adjudication",
    "partition",
    "compatibleProfileIds",
    "criterionAdjudications",
    "dataPolicy",
    "modelInputRef",
    "initialStateRef",
    "oracleRef",
    "evaluatorBindings",
    "slices",
    "lineage",
  ];
  if (options.allowMaterializedFields === true) {
    allowed.push("input", "initialState", "oracle");
  }
  ensureAllowedKeys(record, allowed, "$", issues);

  if (record.schemaVersion !== "evaluation-scenario.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-scenario.v1");
  }
  requireString(record, "scenarioId", "$", issues);
  requireString(record, "revision", "$", issues);
  requireString(record, "title", "$", issues);
  requireString(record, "purpose", "$", issues);
  validateDigest(record.contentDigest, "$/contentDigest", issues);
  ensureUniqueStrings(requireArray(record, "suiteIds", "$", issues), "$/suiteIds", issues, 1);
  ensureEnum(record.riskTier, RISK_TIERS, "$/riskTier", issues);
  ensureEnum(record.lifecycle, LIFECYCLE_STATES, "$/lifecycle", issues);
  ensureEnum(record.adjudication, ADJUDICATION_STATES, "$/adjudication", issues);
  ensureEnum(record.partition, DATASET_PARTITIONS, "$/partition", issues);
  const compatibleProfileIds = ensureUniqueStrings(
    requireArray(record, "compatibleProfileIds", "$", issues),
    "$/compatibleProfileIds",
    issues,
    1,
  );
  const criterionAdjudications = validateCriterionAdjudications(
    record.criterionAdjudications,
    "$/criterionAdjudications",
    issues,
  );
  if (record.adjudication === "human_gold" && criterionAdjudications.length === 0) {
    pushIssue(
      issues,
      "adjudication.atomic_gold_required",
      "$/criterionAdjudications",
      "scenario-level human_gold requires exhaustive atomic adjudication",
    );
  }
  if (
    record.adjudication === "disputed" &&
    !criterionAdjudications.some((item) => item.status === "disputed")
  ) {
    pushIssue(
      issues,
      "adjudication.summary_mismatch",
      "$/adjudication",
      "disputed summary requires at least one disputed criterion",
    );
  }

  const dataPolicy = requireRecord(record.dataPolicy, "$/dataPolicy", issues);
  if (dataPolicy !== undefined) {
    ensureAllowedKeys(dataPolicy, ["dataClass", "containsRealCandidateData", "projection"], "$/dataPolicy", issues);
    ensureEnum(dataPolicy.dataClass, DATA_CLASSES, "$/dataPolicy/dataClass", issues);
    requireBoolean(dataPolicy, "containsRealCandidateData", "$/dataPolicy", issues);
    ensureEnum(
      dataPolicy.projection,
      ["synthetic_content_opt_in", "metadata_only", "prohibited"],
      "$/dataPolicy/projection",
      issues,
    );
    if (
      dataPolicy.containsRealCandidateData === true &&
      (dataPolicy.dataClass === "synthetic_shareable" || dataPolicy.dataClass === "synthetic_restricted")
    ) {
      pushIssue(
        issues,
        "scenario.data_class_conflict",
        "$/dataPolicy/dataClass",
        "real candidate data cannot be classified as synthetic",
      );
    }
    if (
      (dataPolicy.dataClass === "prohibited_export" || dataPolicy.dataClass === "private_reference_only") &&
      dataPolicy.projection === "synthetic_content_opt_in"
    ) {
      pushIssue(
        issues,
        "scenario.projection_conflict",
        "$/dataPolicy/projection",
        "this data class cannot opt in to content projection",
      );
    }
    if (dataPolicy.dataClass === "prohibited_export" && dataPolicy.projection !== "prohibited") {
      pushIssue(
        issues,
        "scenario.prohibited_export",
        "$/dataPolicy/projection",
        "prohibited_export requires prohibited projection",
      );
    }
  }

  validateFixtureReference(record.modelInputRef, "$/modelInputRef", issues);
  validateFixtureReference(record.initialStateRef, "$/initialStateRef", issues);
  validateFixtureReference(record.oracleRef, "$/oracleRef", issues);
  const refs = [record.modelInputRef, record.initialStateRef, record.oracleRef].filter(isRecord);
  const refPaths = refs.map((ref) => ref.path).filter((path): path is string => typeof path === "string");
  const refIds = refs.map((ref) => ref.fixtureId).filter((id): id is string => typeof id === "string");
  if (new Set(refPaths).size !== refPaths.length) {
    pushIssue(issues, "scenario.fixture_separation", "$", "model input, initial state, and oracle must use distinct files");
  }
  if (new Set(refIds).size !== refIds.length) {
    pushIssue(issues, "scenario.fixture_identity", "$", "model input, initial state, and oracle must use distinct fixture IDs");
  }

  const evaluatorBindings = requireArray(record, "evaluatorBindings", "$", issues);
  if (evaluatorBindings.length === 0) {
    pushIssue(issues, "contract.minimum_items", "$/evaluatorBindings", "must contain at least one evaluator");
  }
  const evaluatorIds: string[] = [];
  evaluatorBindings.forEach((value, index) => {
    const path = `$/evaluatorBindings/${index}`;
    const binding = requireRecord(value, path, issues);
    if (binding === undefined) return;
    ensureAllowedKeys(
      binding,
      ["evaluatorId", "version", "contentDigest", "kind", "criterionIds", "requiredForGate"],
      path,
      issues,
    );
    const evaluatorId = requireString(binding, "evaluatorId", path, issues);
    if (evaluatorId !== undefined) evaluatorIds.push(evaluatorId);
    requireString(binding, "version", path, issues);
    validateDigest(binding.contentDigest, `${path}/contentDigest`, issues);
    ensureEnum(binding.kind, ["deterministic", "human", "model", "outcome"], `${path}/kind`, issues);
    ensureUniqueStrings(requireArray(binding, "criterionIds", path, issues), `${path}/criterionIds`, issues, 1);
    requireBoolean(binding, "requiredForGate", path, issues);
    if (
      (record.riskTier === "p0_blocker" || record.riskTier === "p1_core") &&
      binding.kind === "model" &&
      binding.requiredForGate === true
    ) {
      pushIssue(
        issues,
        "scenario.model_gate_authority",
        `${path}/requiredForGate`,
        "a model evaluator cannot own a P0/P1 gate",
      );
    }
  });
  if (new Set(evaluatorIds).size !== evaluatorIds.length) {
    pushIssue(issues, "contract.duplicate", "$/evaluatorBindings", "evaluator IDs must be unique");
  }

  const slices = requireRecord(record.slices, "$/slices", issues);
  if (slices !== undefined) {
    for (const [key, value] of Object.entries(slices)) {
      if (key.length === 0 || typeof value !== "string") {
        pushIssue(issues, "scenario.slice", `$/slices/${key}`, "slice names and values must be strings");
      }
    }
    if (
      typeof slices.defaultProfileId === "string" &&
      !compatibleProfileIds.includes(slices.defaultProfileId)
    ) {
      pushIssue(
        issues,
        "scenario.default_profile_incompatible",
        "$/slices/defaultProfileId",
        "must be included in compatibleProfileIds",
      );
    }
  }
  validateScenarioLineage(record.lineage, "$/lineage", issues);

  if (hasValidSha256Format(record.contentDigest)) {
    const digestSource = options.allowMaterializedFields === true
      ? Object.fromEntries(Object.entries(record).filter(([key]) => !["contentDigest", "input", "initialState", "oracle"].includes(key)))
      : Object.fromEntries(Object.entries(record).filter(([key]) => key !== "contentDigest"));
    const expected = digestCanonicalJson(digestSource);
    if (record.contentDigest !== expected) {
      pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
    }
  }

  return issues;
}

function meaningfulOracleTokens(value: unknown, path: string, tokens: Set<string>): void {
  if (typeof value === "string" && value.trim().length >= 16) {
    tokens.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => meaningfulOracleTokens(item, `${path}/${index}`, tokens));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      // Evidence refs and atomic expected facts may legitimately originate in
      // the model input. Leak detection targets answer/rubric material, not
      // the source facts that a correct evaluator later checks.
      if (["criterionId", "evidenceLocator", "evidenceRefs", "expected", "schemaVersion"].includes(key)) continue;
      meaningfulOracleTokens(item, `${path}/${key}`, tokens);
    }
  }
}

function isOracleKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
  const segments = normalized.split("_");
  return segments.some((segment) => ["oracle", "forbidden", "expected", "gold"].includes(segment)) ||
    normalized === "answer_key" || normalized === "answerkey";
}

function scanModelInput(
  value: unknown,
  path: string,
  oracleTokens: ReadonlySet<string>,
  issues: ValidationIssue[],
): void {
  if (typeof value === "string") {
    for (const token of oracleTokens) {
      if (value.includes(token)) {
        pushIssue(issues, "scenario.oracle_value_leak", path, "contains an exact oracle value");
        break;
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanModelInput(item, `${path}/${index}`, oracleTokens, issues));
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (isOracleKey(key)) {
        pushIssue(issues, "scenario.oracle_key_leak", `${path}/${key}`, "uses a model-visible oracle/gold key");
      }
      scanModelInput(item, `${path}/${key}`, oracleTokens, issues);
    }
  }
}

function validateOracle(value: unknown, riskTier: unknown, issues: ValidationIssue[]): void {
  const oracle = requireRecord(value, "$/oracle", issues);
  if (oracle === undefined) return;
  ensureAllowedKeys(
    oracle,
    [
      "schemaVersion",
      "oracleId",
      "scenarioId",
      "observations",
      "identity",
      "transitions",
      "terminal",
      "proposal",
      "requiredQuestions",
      "allowedEffects",
      "forbidden",
    ],
    "$/oracle",
    issues,
  );
  if (oracle.schemaVersion !== "evaluation-oracle.v1") {
    pushIssue(issues, "contract.schema_version", "$/oracle/schemaVersion", "must equal evaluation-oracle.v1");
  }
  requireString(oracle, "oracleId", "$/oracle", issues);
  requireString(oracle, "scenarioId", "$/oracle", issues);
  requireArray(oracle, "observations", "$/oracle", issues).forEach((item, index) => {
    const path = `$/oracle/observations/${index}`;
    const criterion = requireRecord(item, path, issues);
    if (criterion === undefined) return;
    ensureAllowedKeys(criterion, ["criterionId", "operator", "actualPath", "expected"], path, issues);
    requireString(criterion, "criterionId", path, issues);
    ensureEnum(
      criterion.operator,
      ["equals", "contains", "excludes", "exists", "count_equals", "at_most", "ordered_before"],
      `${path}/operator`,
      issues,
    );
    requireString(criterion, "actualPath", path, issues);
    if (!("expected" in criterion)) pushIssue(issues, "contract.required", `${path}/expected`, "is required");
  });
  const identity = requireRecord(oracle.identity, "$/oracle/identity", issues);
  if (identity !== undefined) {
    ensureAllowedKeys(
      identity,
      ["criterionId", "decision", "expectedPersonRef", "reviewRequired", "evidenceRefs"],
      "$/oracle/identity",
      issues,
    );
    requireString(identity, "criterionId", "$/oracle/identity", issues);
    ensureEnum(
      identity.decision,
      ["not_applicable", "propose_new", "require_human_binding", "abstain", "propose_merge", "possible_matches"],
      "$/oracle/identity/decision",
      issues,
    );
    if (identity.expectedPersonRef !== undefined) requireString(identity, "expectedPersonRef", "$/oracle/identity", issues);
    requireBoolean(identity, "reviewRequired", "$/oracle/identity", issues);
    if (identity.evidenceRefs !== undefined) {
      ensureUniqueStrings(requireArray(identity, "evidenceRefs", "$/oracle/identity", issues), "$/oracle/identity/evidenceRefs", issues);
    }
  }
  requireArray(oracle, "transitions", "$/oracle", issues).forEach((item, index) => {
    const path = `$/oracle/transitions/${index}`;
    const transition = requireRecord(item, path, issues);
    if (transition === undefined) return;
    ensureAllowedKeys(transition, ["criterionId", "operation", "target", "authority", "evidenceRefs"], path, issues);
    requireString(transition, "criterionId", path, issues);
    requireString(transition, "operation", path, issues);
    requireString(transition, "target", path, issues);
    ensureEnum(
      transition.authority,
      ["none", "proposed", "confirmed", "contested", "unavailable", "external_observed"],
      `${path}/authority`,
      issues,
    );
    ensureUniqueStrings(requireArray(transition, "evidenceRefs", path, issues), `${path}/evidenceRefs`, issues);
  });
  const terminal = requireRecord(oracle.terminal, "$/oracle/terminal", issues);
  if (terminal !== undefined) {
    ensureAllowedKeys(terminal, ["criterionId", "status", "reasonCode"], "$/oracle/terminal", issues);
    requireString(terminal, "criterionId", "$/oracle/terminal", issues);
    ensureEnum(
      terminal.status,
      ["no_action", "clarify", "abstain", "proposal", "blocked", "partial", "completed"],
      "$/oracle/terminal/status",
      issues,
    );
    requireString(terminal, "reasonCode", "$/oracle/terminal", issues);
  }
  if (oracle.proposal !== undefined) {
    const proposal = requireRecord(oracle.proposal, "$/oracle/proposal", issues);
    if (proposal !== undefined) {
      ensureAllowedKeys(proposal, ["criterionId", "kind", "maxCount", "requiresHumanReview", "evidenceRefs"], "$/oracle/proposal", issues);
      requireString(proposal, "criterionId", "$/oracle/proposal", issues);
      requireString(proposal, "kind", "$/oracle/proposal", issues);
      requireInteger(proposal, "maxCount", 0, "$/oracle/proposal", issues);
      requireBoolean(proposal, "requiresHumanReview", "$/oracle/proposal", issues);
      if (proposal.evidenceRefs !== undefined) {
        ensureUniqueStrings(requireArray(proposal, "evidenceRefs", "$/oracle/proposal", issues), "$/oracle/proposal/evidenceRefs", issues);
      }
    }
  }
  ensureUniqueStrings(requireArray(oracle, "requiredQuestions", "$/oracle", issues), "$/oracle/requiredQuestions", issues);
  requireArray(oracle, "allowedEffects", "$/oracle", issues).forEach((item, index) => {
    const path = `$/oracle/allowedEffects/${index}`;
    const effect = requireRecord(item, path, issues);
    if (effect === undefined) return;
    ensureAllowedKeys(effect, ["effectType", "maxCount", "requiresExactApproval"], path, issues);
    requireString(effect, "effectType", path, issues);
    requireInteger(effect, "maxCount", 0, path, issues);
    requireBoolean(effect, "requiresExactApproval", path, issues);
  });
  const forbidden = requireArray(oracle, "forbidden", "$/oracle", issues);
  if ((riskTier === "p0_blocker" || riskTier === "p1_core") && forbidden.length === 0) {
    pushIssue(
      issues,
      "scenario.forbidden_required",
      "$/oracle/forbidden",
      "P0/P1 scenarios must declare at least one forbidden outcome",
    );
  }
  forbidden.forEach((item, index) => {
    const path = `$/oracle/forbidden/${index}`;
    const record = requireRecord(item, path, issues);
    if (record === undefined) return;
    ensureAllowedKeys(record, ["criterionId", "code", "description", "blocker"], path, issues);
    requireString(record, "criterionId", path, issues);
    requireString(record, "code", path, issues);
    requireString(record, "description", path, issues);
    requireBoolean(record, "blocker", path, issues);
  });
}

function validateMaterializedFixtureDigest(
  ref: unknown,
  content: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(ref) || !hasValidSha256Format(ref.contentDigest)) return;
  const actual = isRecord(content) && "contentDigest" in content
    ? digestContentDocument(content)
    : digestCanonicalJson(content);
  if (actual !== ref.contentDigest) {
    pushIssue(issues, "scenario.fixture_digest_mismatch", path, `content digest is ${actual}, expected ${ref.contentDigest}`);
  }
}

export function validateScenarioDocument(value: unknown): ValidationResult {
  const issues = validateScenarioDocumentInternal(value);
  return { valid: issues.length === 0, issues };
}

export function assertValidScenarioDocument(value: unknown): asserts value is EvaluationScenarioDocumentV1 {
  const result = validateScenarioDocument(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationScenarioDocumentV1", result.issues);
}

export function validateMaterializedScenario(value: unknown): ValidationResult {
  const issues = validateScenarioDocumentInternal(value, { allowMaterializedFields: true });
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) return { valid: false, issues };

  try {
    canonicalizeJson(record.input);
  } catch (error) {
    pushIssue(issues, "contract.json", "$/input", error instanceof Error ? error.message : "must be JSON");
  }
  try {
    canonicalizeJson(record.initialState);
  } catch (error) {
    pushIssue(issues, "contract.json", "$/initialState", error instanceof Error ? error.message : "must be JSON");
  }

  validateOracle(record.oracle, record.riskTier, issues);
  validateMaterializedFixtureDigest(record.oracleRef, record.oracle, "$/oracleRef/contentDigest", issues);

  if (record.input !== undefined && isRecord(record.oracle)) {
    const tokens = new Set<string>();
    meaningfulOracleTokens(record.oracle, "$/oracle", tokens);
    scanModelInput(record.input, "$/input", tokens, issues);
  }

  if (isRecord(record.oracle) && Array.isArray(record.evaluatorBindings)) {
    const oracle = record.oracle as unknown as ScenarioOracleV1;
    const bindings = record.evaluatorBindings as EvaluationScenarioDocumentV1["evaluatorBindings"];
    const criterionIds = collectAdjudicableCriterionIds(oracle, bindings);
    const adjudications = Array.isArray(record.criterionAdjudications)
      ? record.criterionAdjudications as EvaluationScenarioDocumentV1["criterionAdjudications"]
      : [];
    const allowedCriteria = new Set(criterionIds);
    adjudications.forEach((item, index) => {
      if (!allowedCriteria.has(item.criterionId)) {
        pushIssue(
          issues,
          "adjudication.unknown_criterion",
          `$/criterionAdjudications/${index}/criterionId`,
          "must identify an oracle or evaluator-binding criterion",
        );
      }
    });
    const derived = deriveScenarioAdjudication(adjudications, criterionIds);
    if (record.adjudication !== derived) {
      pushIssue(
        issues,
        "adjudication.summary_mismatch",
        "$/adjudication",
        `must equal derived atomic adjudication ${derived}`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidMaterializedScenario(value: unknown): asserts value is EvaluationScenarioV1 {
  const result = validateMaterializedScenario(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationScenarioV1", result.issues);
}

function validateFrozenDependency(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecord(value, path, issues);
  if (record === undefined) return;
  ensureAllowedKeys(record, ["bindingId", "component", "fixture", "reason"], path, issues);
  requireString(record, "bindingId", path, issues);
  ensureEnum(record.component, EVALUATED_COMPONENTS, `${path}/component`, issues);
  validateFixtureReference(record.fixture, `${path}/fixture`, issues);
  requireString(record, "reason", path, issues);
}

function validateProfileInternal(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(value, "$", issues);
  if (record === undefined) return issues;
  ensureAllowedKeys(
    record,
    [
      "schemaVersion",
      "profileId",
      "version",
      "contentDigest",
      "mode",
      "systemUnderTest",
      "frozenDependencies",
      "liveDependencies",
      "clock",
      "idGenerator",
      "timer",
      "budgets",
      "reporters",
    ],
    "$",
    issues,
  );
  if (record.schemaVersion !== "evaluation-profile.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-profile.v1");
  }
  requireString(record, "profileId", "$", issues);
  requireString(record, "version", "$", issues);
  validateDigest(record.contentDigest, "$/contentDigest", issues);
  ensureEnum(record.mode, EXECUTION_MODES, "$/mode", issues);
  const systemUnderTest = ensureUniqueStrings(
    requireArray(record, "systemUnderTest", "$", issues),
    "$/systemUnderTest",
    issues,
    1,
  );
  systemUnderTest.forEach((component, index) => ensureEnum(component, EVALUATED_COMPONENTS, `$/systemUnderTest/${index}`, issues));

  const frozen = requireArray(record, "frozenDependencies", "$", issues);
  const frozenBindingIds: string[] = [];
  const frozenComponents: string[] = [];
  frozen.forEach((dependency, index) => {
    validateFrozenDependency(dependency, `$/frozenDependencies/${index}`, issues);
    if (isRecord(dependency)) {
      if (typeof dependency.bindingId === "string") frozenBindingIds.push(dependency.bindingId);
      if (typeof dependency.component === "string") frozenComponents.push(dependency.component);
      if (typeof dependency.component === "string" && systemUnderTest.includes(dependency.component)) {
        pushIssue(
          issues,
          "profile.system_under_test_frozen",
          `$/frozenDependencies/${index}/component`,
          "a system-under-test component cannot be replaced by a frozen fixture",
        );
      }
    }
  });

  const live = requireArray(record, "liveDependencies", "$", issues);
  const liveBindingIds: string[] = [];
  const liveComponents: string[] = [];
  live.forEach((dependency, index) => {
    const path = `$/liveDependencies/${index}`;
    const binding = requireRecord(dependency, path, issues);
    if (binding === undefined) return;
    ensureAllowedKeys(binding, ["bindingId", "component", "implementation", "reason"], path, issues);
    const bindingId = requireString(binding, "bindingId", path, issues);
    if (bindingId !== undefined) liveBindingIds.push(bindingId);
    ensureEnum(binding.component, EVALUATED_COMPONENTS, `${path}/component`, issues);
    if (typeof binding.component === "string") liveComponents.push(binding.component);
    validateContentIdentity(binding.implementation, `${path}/implementation`, issues);
    requireString(binding, "reason", path, issues);
  });
  const allBindingIds = [...frozenBindingIds, ...liveBindingIds];
  if (new Set(allBindingIds).size !== allBindingIds.length) {
    pushIssue(issues, "profile.duplicate_binding", "$", "dependency binding IDs must be unique");
  }
  for (const component of new Set(frozenComponents)) {
    if (liveComponents.includes(component)) {
      pushIssue(
        issues,
        "profile.ambiguous_dependency",
        "$",
        `${component} cannot be both a frozen and live dependency`,
      );
    }
  }

  const validateRuntimeBinding = (
    key: "clock" | "idGenerator" | "timer",
    modes: readonly string[],
  ): void => {
    const binding = requireRecord(record[key], `$/${key}`, issues);
    if (binding === undefined) return;
    ensureAllowedKeys(binding, ["bindingId", "mode", "version", "contentDigest"], `$/${key}`, issues);
    requireString(binding, "bindingId", `$/${key}`, issues);
    ensureEnum(binding.mode, modes, `$/${key}/mode`, issues);
    requireString(binding, "version", `$/${key}`, issues);
    validateDigest(binding.contentDigest, `$/${key}/contentDigest`, issues);
  };
  validateRuntimeBinding("clock", ["system", "frozen", "controlled"]);
  validateRuntimeBinding("idGenerator", ["system", "deterministic"]);
  validateRuntimeBinding("timer", ["system", "controlled"]);
  if (record.mode === "control_plane_replay") {
    const clock = isRecord(record.clock) ? record.clock : undefined;
    const ids = isRecord(record.idGenerator) ? record.idGenerator : undefined;
    const timer = isRecord(record.timer) ? record.timer : undefined;
    if (clock?.mode === "system") {
      pushIssue(issues, "profile.nondeterministic_clock", "$/clock/mode", "control-plane replay must control the clock");
    }
    if (ids?.mode === "system") {
      pushIssue(issues, "profile.nondeterministic_ids", "$/idGenerator/mode", "control-plane replay must use deterministic IDs");
    }
    if (timer?.mode === "system") {
      pushIssue(issues, "profile.nondeterministic_timer", "$/timer/mode", "control-plane replay must control timers");
    }
  }
  if (record.mode === "integration_probe" && !systemUnderTest.some((component) => liveComponents.includes(component))) {
    pushIssue(
      issues,
      "profile.integration_sut_not_live",
      "$/liveDependencies",
      "an integration probe must exercise at least one live system-under-test component",
    );
  }

  const budgets = requireRecord(record.budgets, "$/budgets", issues);
  if (budgets !== undefined) {
    ensureAllowedKeys(
      budgets,
      ["maximumSteps", "maximumToolCalls", "maximumDurationMs", "maximumRetries"],
      "$/budgets",
      issues,
    );
    requireInteger(budgets, "maximumSteps", 1, "$/budgets", issues);
    requireInteger(budgets, "maximumToolCalls", 0, "$/budgets", issues);
    requireInteger(budgets, "maximumDurationMs", 1, "$/budgets", issues);
    requireInteger(budgets, "maximumRetries", 0, "$/budgets", issues);
  }

  const reporters = requireArray(record, "reporters", "$", issues);
  if (reporters.length === 0) pushIssue(issues, "contract.minimum_items", "$/reporters", "must contain a local reporter");
  let hasRequiredLocalReporter = false;
  reporters.forEach((reporter, index) => {
    const path = `$/reporters/${index}`;
    const binding = requireRecord(reporter, path, issues);
    if (binding === undefined) return;
    ensureAllowedKeys(binding, ["reporterId", "version", "destination", "contentDigest", "required"], path, issues);
    requireString(binding, "reporterId", path, issues);
    requireString(binding, "version", path, issues);
    ensureEnum(binding.destination, ["local", "opik", "other"], `${path}/destination`, issues);
    validateDigest(binding.contentDigest, `${path}/contentDigest`, issues);
    requireBoolean(binding, "required", path, issues);
    if (binding.destination === "local" && binding.required === true) hasRequiredLocalReporter = true;
  });
  if (!hasRequiredLocalReporter) {
    pushIssue(issues, "profile.local_reporter_required", "$/reporters", "must include a required local reporter");
  }

  if (hasValidSha256Format(record.contentDigest)) {
    const expected = digestContentDocument(record);
    if (record.contentDigest !== expected) {
      pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
    }
  }
  return issues;
}

export function validateProfile(value: unknown): ValidationResult {
  const issues = validateProfileInternal(value);
  return { valid: issues.length === 0, issues };
}

export function assertValidProfile(value: unknown): asserts value is EvaluationExecutionProfileV1 {
  const result = validateProfile(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationExecutionProfileV1", result.issues);
}

function validateAttemptInternal(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(value, "$", issues);
  if (record === undefined) return issues;
  ensureAllowedKeys(
    record,
    [
      "schemaVersion",
      "attemptId",
      "contentDigest",
      "scenario",
      "profile",
      "agentDefinition",
      "trialNumber",
      "gitSha",
      "systemUnderTest",
      "frozenDependencies",
      "fingerprints",
      "startedAt",
    ],
    "$",
    issues,
  );
  if (record.schemaVersion !== "evaluation-attempt.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-attempt.v1");
  }
  requireString(record, "attemptId", "$", issues);
  validateDigest(record.contentDigest, "$/contentDigest", issues);
  validateContentIdentity(record.scenario, "$/scenario", issues);
  validateContentIdentity(record.profile, "$/profile", issues);
  const definition = requireRecord(record.agentDefinition, "$/agentDefinition", issues);
  if (definition !== undefined) {
    ensureAllowedKeys(definition, ["definitionId", "version", "contentDigest"], "$/agentDefinition", issues);
    requireString(definition, "definitionId", "$/agentDefinition", issues);
    requireString(definition, "version", "$/agentDefinition", issues);
    validateDigest(definition.contentDigest, "$/agentDefinition/contentDigest", issues);
  }
  requireInteger(record, "trialNumber", 1, "$", issues);
  const gitSha = requireString(record, "gitSha", "$", issues);
  if (gitSha !== undefined && !/^[a-f0-9]{7,64}$/.test(gitSha)) {
    pushIssue(issues, "attempt.git_sha", "$/gitSha", "must be 7-64 lowercase hexadecimal characters");
  }
  const systemUnderTest = ensureUniqueStrings(
    requireArray(record, "systemUnderTest", "$", issues),
    "$/systemUnderTest",
    issues,
    1,
  );
  systemUnderTest.forEach((component, index) => ensureEnum(component, EVALUATED_COMPONENTS, `$/systemUnderTest/${index}`, issues));
  requireArray(record, "frozenDependencies", "$", issues).forEach((dependency, index) => {
    validateFrozenDependency(dependency, `$/frozenDependencies/${index}`, issues);
    if (isRecord(dependency) && typeof dependency.component === "string" && systemUnderTest.includes(dependency.component)) {
      pushIssue(
        issues,
        "attempt.system_under_test_frozen",
        `$/frozenDependencies/${index}/component`,
        "a system-under-test component cannot be replaced by a frozen fixture",
      );
    }
  });
  const fingerprints = requireRecord(record.fingerprints, "$/fingerprints", issues);
  if (fingerprints !== undefined) {
    const keys = ["provider", "model", "prompt", "policy", "toolManifest", "sdk", "rubric", "exportPolicy", "context"];
    ensureAllowedKeys(fingerprints, keys, "$/fingerprints", issues);
    keys.forEach((key) => validateContentIdentity(fingerprints[key], `$/fingerprints/${key}`, issues));
  }
  const startedAt = requireString(record, "startedAt", "$", issues);
  if (startedAt !== undefined && Number.isNaN(Date.parse(startedAt))) {
    pushIssue(issues, "contract.date_time", "$/startedAt", "must be an ISO date-time");
  }
  if (hasValidSha256Format(record.contentDigest)) {
    const expected = digestContentDocument(record);
    if (record.contentDigest !== expected) {
      pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
    }
  }
  return issues;
}

export function validateAttempt(value: unknown): ValidationResult {
  const issues = validateAttemptInternal(value);
  return { valid: issues.length === 0, issues };
}

export function createEvaluationAttemptId(input: {
  scenario: ContentIdentityV1;
  profile: ContentIdentityV1;
  agentDefinition: { definitionId: string; version: string; contentDigest: string };
  trialNumber: number;
}): string {
  const identity = digestCanonicalJson({
    scenario: input.scenario,
    profile: input.profile,
    agentDefinition: input.agentDefinition,
    trialNumber: input.trialNumber,
  });
  return `attempt_${identity.slice("sha256:".length, "sha256:".length + 32)}`;
}

export function validateAttemptAgainstProfile(
  attempt: unknown,
  profile: unknown,
): ValidationResult {
  const issues = [...validateAttemptInternal(attempt), ...validateProfileInternal(profile).map((issue) => ({
    ...issue,
    path: `$/profile${issue.path.slice(1)}`,
  }))];
  if (!isRecord(attempt) || !isRecord(profile)) return { valid: issues.length === 0, issues };

  const profileRef = isRecord(attempt.profile) ? attempt.profile : undefined;
  if (
    profileRef !== undefined &&
    (profileRef.identityId !== profile.profileId ||
      profileRef.version !== profile.version ||
      profileRef.contentDigest !== profile.contentDigest)
  ) {
    pushIssue(issues, "attempt.profile_mismatch", "$/profile", "does not identify the supplied execution profile");
  }
  if (JSON.stringify(attempt.systemUnderTest) !== JSON.stringify(profile.systemUnderTest)) {
    pushIssue(issues, "attempt.sut_mismatch", "$/systemUnderTest", "must exactly snapshot the profile systemUnderTest");
  }
  if (digestCanonicalJson(attempt.frozenDependencies) !== digestCanonicalJson(profile.frozenDependencies)) {
    pushIssue(
      issues,
      "attempt.frozen_dependencies_mismatch",
      "$/frozenDependencies",
      "must exactly snapshot profile frozenDependencies",
    );
  }
  if (isRecord(attempt.scenario) && isRecord(attempt.agentDefinition) && typeof attempt.trialNumber === "number") {
    const expectedId = createEvaluationAttemptId({
      scenario: attempt.scenario as unknown as ContentIdentityV1,
      profile: attempt.profile as unknown as ContentIdentityV1,
      agentDefinition: attempt.agentDefinition as unknown as {
        definitionId: string;
        version: string;
        contentDigest: string;
      },
      trialNumber: attempt.trialNumber,
    });
    if (attempt.attemptId !== expectedId) {
      pushIssue(issues, "attempt.unstable_id", "$/attemptId", `must equal stable ID ${expectedId}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidAttempt(value: unknown): asserts value is EvaluationAttemptV1 {
  const result = validateAttempt(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationAttemptV1", result.issues);
}

function validateScoreInternal(value: unknown, path: string, issues: ValidationIssue[]): void {
  const score = requireRecord(value, path, issues);
  if (score === undefined) return;
  ensureAllowedKeys(
    score,
    [
      "schemaVersion",
      "scoreId",
      "scenarioId",
      "attemptId",
      "capability",
      "criterionId",
      "evaluatorId",
      "evaluatorVersion",
      "evaluatorKind",
      "riskTier",
      "status",
      "gateAuthority",
      "veto",
      "evidence",
      "reasonCode",
      "value",
    ],
    path,
    issues,
  );
  if (score.schemaVersion !== "evaluation-score.v1") {
    pushIssue(issues, "contract.schema_version", `${path}/schemaVersion`, "must equal evaluation-score.v1");
  }
  ["scoreId", "scenarioId", "attemptId", "capability", "criterionId", "evaluatorId", "evaluatorVersion"].forEach((key) =>
    requireString(score, key, path, issues));
  ensureEnum(score.evaluatorKind, ["deterministic", "human", "model", "outcome"], `${path}/evaluatorKind`, issues);
  ensureEnum(score.riskTier, RISK_TIERS, `${path}/riskTier`, issues);
  ensureEnum(score.status, GATE_STATUSES, `${path}/status`, issues);
  requireBoolean(score, "gateAuthority", path, issues);
  requireBoolean(score, "veto", path, issues);
  if (score.reasonCode !== undefined) requireString(score, "reasonCode", path, issues);
  const evidence = requireArray(score, "evidence", path, issues);
  evidence.forEach((item, index) => {
    const evidencePath = `${path}/evidence/${index}`;
    const locator = requireRecord(item, evidencePath, issues);
    if (locator === undefined) return;
    ensureAllowedKeys(locator, ["artifactId", "jsonPointer", "sourceRef"], evidencePath, issues);
    requireString(locator, "artifactId", evidencePath, issues);
    if (locator.jsonPointer !== undefined) requireString(locator, "jsonPointer", evidencePath, issues);
    if (locator.sourceRef !== undefined) requireString(locator, "sourceRef", evidencePath, issues);
  });
  if (score.status === "fail" && evidence.length === 0) {
    pushIssue(issues, "score.failure_evidence_required", `${path}/evidence`, "a failure must cite evidence");
  }
  if (score.veto === true && score.gateAuthority !== true) {
    pushIssue(issues, "score.veto_without_authority", `${path}/veto`, "cannot veto without gate authority");
  }
  if (score.riskTier === "p0_blocker" && score.evaluatorKind === "model" && score.gateAuthority === true) {
    pushIssue(issues, "score.model_p0_authority", `${path}/gateAuthority`, "a model evaluator cannot own P0 authority");
  }
  if ("value" in score) {
    try {
      canonicalizeJson(score.value);
    } catch (error) {
      pushIssue(issues, "contract.json", `${path}/value`, error instanceof Error ? error.message : "must be JSON");
    }
  }
}

export function validateScore(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateScoreInternal(value, "$", issues);
  return { valid: issues.length === 0, issues };
}

export function assertValidScore(value: unknown): asserts value is EvaluationScoreV1 {
  const result = validateScore(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationScoreV1", result.issues);
}

export function validateGate(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const gate = requireRecord(value, "$", issues);
  if (gate === undefined) return { valid: false, issues };
  ensureAllowedKeys(
    gate,
    ["schemaVersion", "gateId", "scenarioId", "attemptId", "status", "capabilities", "scores", "createdAt", "contentDigest"],
    "$",
    issues,
  );
  if (gate.schemaVersion !== "evaluation-gate.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-gate.v1");
  }
  ["gateId", "scenarioId", "attemptId", "createdAt"].forEach((key) => requireString(gate, key, "$", issues));
  ensureEnum(gate.status, GATE_STATUSES, "$/status", issues);
  validateDigest(gate.contentDigest, "$/contentDigest", issues);
  const scoreIds = new Set<string>();
  requireArray(gate, "scores", "$", issues).forEach((score, index) => {
    validateScoreInternal(score, `$/scores/${index}`, issues);
    if (isRecord(score) && typeof score.scoreId === "string") {
      if (scoreIds.has(score.scoreId)) pushIssue(issues, "gate.duplicate_score", `$/scores/${index}/scoreId`, "must be unique");
      scoreIds.add(score.scoreId);
      if (score.scenarioId !== gate.scenarioId || score.attemptId !== gate.attemptId) {
        pushIssue(issues, "gate.score_scope_mismatch", `$/scores/${index}`, "does not belong to this Scenario Attempt");
      }
    }
  });
  const capabilityStatuses: string[] = [];
  requireArray(gate, "capabilities", "$", issues).forEach((item, index) => {
    const path = `$/capabilities/${index}`;
    const capability = requireRecord(item, path, issues);
    if (capability === undefined) return;
    ensureAllowedKeys(
      capability,
      ["capability", "status", "scoreIds", "vetoScoreIds", "missingEvaluatorIds", "reasonCodes"],
      path,
      issues,
    );
    requireString(capability, "capability", path, issues);
    ensureEnum(capability.status, GATE_STATUSES, `${path}/status`, issues);
    if (typeof capability.status === "string") capabilityStatuses.push(capability.status);
    const referenced = ensureUniqueStrings(requireArray(capability, "scoreIds", path, issues), `${path}/scoreIds`, issues);
    const vetoes = ensureUniqueStrings(requireArray(capability, "vetoScoreIds", path, issues), `${path}/vetoScoreIds`, issues);
    ensureUniqueStrings(requireArray(capability, "missingEvaluatorIds", path, issues), `${path}/missingEvaluatorIds`, issues);
    ensureUniqueStrings(requireArray(capability, "reasonCodes", path, issues), `${path}/reasonCodes`, issues);
    referenced.forEach((scoreId) => {
      if (!scoreIds.has(scoreId)) pushIssue(issues, "gate.unknown_score", `${path}/scoreIds`, `references unknown ${scoreId}`);
    });
    vetoes.forEach((scoreId) => {
      if (!referenced.includes(scoreId)) pushIssue(issues, "gate.veto_not_in_capability", `${path}/vetoScoreIds`, `${scoreId} is not a capability score`);
    });
    if (vetoes.length > 0 && capability.status !== "fail") {
      pushIssue(issues, "gate.veto_not_failed", `${path}/status`, "must be fail when a veto exists");
    }
  });
  const expectedOverall = capabilityStatuses.includes("fail")
    ? "fail"
    : capabilityStatuses.includes("not_run")
      ? "not_run"
      : capabilityStatuses.includes("needs_review")
        ? "needs_review"
        : capabilityStatuses.length > 0
          ? "pass"
          : "not_run";
  if (gate.status !== expectedOverall) {
    pushIssue(issues, "gate.overall_status_mismatch", "$/status", `must equal ${expectedOverall}`);
  }
  if (typeof gate.createdAt === "string" && Number.isNaN(Date.parse(gate.createdAt))) {
    pushIssue(issues, "contract.date_time", "$/createdAt", "must be an ISO date-time");
  }
  if (hasValidSha256Format(gate.contentDigest)) {
    const expected = digestContentDocument(gate);
    if (gate.contentDigest !== expected) pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidGate(value: unknown): asserts value is EvaluationGateResultV1 {
  const result = validateGate(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationGateResultV1", result.issues);
}

export function validateResult(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const result = requireRecord(value, "$", issues);
  if (result === undefined) return { valid: false, issues };
  ensureAllowedKeys(
    result,
    ["schemaVersion", "resultId", "attemptId", "terminalStatus", "terminalReasonCode", "gate", "traceDigest", "startedAt", "completedAt", "contentDigest"],
    "$",
    issues,
  );
  if (result.schemaVersion !== "evaluation-result.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-result.v1");
  }
  ["resultId", "attemptId", "terminalReasonCode", "startedAt", "completedAt"].forEach((key) => requireString(result, key, "$", issues));
  ensureEnum(result.terminalStatus, ["completed", "cancelled", "timed_out", "crashed", "not_run"], "$/terminalStatus", issues);
  validateDigest(result.traceDigest, "$/traceDigest", issues);
  validateDigest(result.contentDigest, "$/contentDigest", issues);
  const gateValidation = validateGate(result.gate);
  issues.push(...gateValidation.issues.map((issue) => ({ ...issue, path: `$/gate${issue.path.slice(1)}` })));
  if (isRecord(result.gate) && result.gate.attemptId !== result.attemptId) {
    pushIssue(issues, "result.attempt_mismatch", "$/gate/attemptId", "does not match Result attemptId");
  }
  const started = typeof result.startedAt === "string" ? Date.parse(result.startedAt) : Number.NaN;
  const completed = typeof result.completedAt === "string" ? Date.parse(result.completedAt) : Number.NaN;
  if (Number.isNaN(started)) pushIssue(issues, "contract.date_time", "$/startedAt", "must be an ISO date-time");
  if (Number.isNaN(completed)) pushIssue(issues, "contract.date_time", "$/completedAt", "must be an ISO date-time");
  if (!Number.isNaN(started) && !Number.isNaN(completed) && completed < started) {
    pushIssue(issues, "result.time_order", "$/completedAt", "cannot precede startedAt");
  }
  if (hasValidSha256Format(result.contentDigest)) {
    const expected = digestContentDocument(result);
    if (result.contentDigest !== expected) pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidResult(value: unknown): asserts value is EvaluationResultV1 {
  const result = validateResult(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationResultV1", result.issues);
}

export function validateProjectionReceipt(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const receipt = requireRecord(value, "$", issues);
  if (receipt === undefined) return { valid: false, issues };
  ensureAllowedKeys(
    receipt,
    ["schemaVersion", "receiptId", "projectionId", "runId", "destination", "status", "idempotencyKey", "attemptNumber", "localArtifactDigest", "externalId", "reasonCode", "createdAt", "contentDigest"],
    "$",
    issues,
  );
  if (receipt.schemaVersion !== "evaluation-projection-receipt.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-projection-receipt.v1");
  }
  ["receiptId", "projectionId", "runId", "destination", "idempotencyKey", "createdAt"].forEach((key) => requireString(receipt, key, "$", issues));
  ensureEnum(receipt.status, ["pending", "succeeded", "failed", "deleted", "not_run"], "$/status", issues);
  requireInteger(receipt, "attemptNumber", 1, "$", issues);
  validateDigest(receipt.localArtifactDigest, "$/localArtifactDigest", issues);
  validateDigest(receipt.contentDigest, "$/contentDigest", issues);
  if (receipt.externalId !== undefined) requireString(receipt, "externalId", "$", issues);
  if (receipt.reasonCode !== undefined) requireString(receipt, "reasonCode", "$", issues);
  if ((receipt.status === "failed" || receipt.status === "not_run") && receipt.reasonCode === undefined) {
    pushIssue(issues, "receipt.reason_required", "$/reasonCode", "is required for failed/not_run receipts");
  }
  if (typeof receipt.createdAt === "string" && Number.isNaN(Date.parse(receipt.createdAt))) {
    pushIssue(issues, "contract.date_time", "$/createdAt", "must be an ISO date-time");
  }
  if (hasValidSha256Format(receipt.contentDigest)) {
    const expected = digestContentDocument(receipt);
    if (receipt.contentDigest !== expected) pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidProjectionReceipt(value: unknown): asserts value is ProjectionReceiptV1 {
  const result = validateProjectionReceipt(value);
  if (!result.valid) throw new EvaluationContractError("ProjectionReceiptV1", result.issues);
}

export function validateDeletionReceipt(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const receipt = requireRecord(value, "$", issues);
  if (receipt === undefined) return { valid: false, issues };
  ensureAllowedKeys(
    receipt,
    [
      "schemaVersion",
      "receiptId",
      "projectionId",
      "status",
      "deletionScope",
      "retainedSurfaces",
      "readBackVerified",
      "reasonCode",
      "createdAt",
      "contentDigest",
    ],
    "$",
    issues,
  );
  if (receipt.schemaVersion !== "evaluation-deletion-receipt.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-deletion-receipt.v1");
  }
  ["receiptId", "projectionId", "reasonCode", "createdAt"].forEach((key) =>
    requireString(receipt, key, "$", issues));
  ensureEnum(receipt.status, ["deleted", "not_found", "failed"], "$/status", issues);
  ensureEnum(
    receipt.deletionScope,
    ["trace_projection", "full_remote_projection", "local_projection_tombstone"],
    "$/deletionScope",
    issues,
  );
  ensureUniqueStrings(
    requireArray(receipt, "retainedSurfaces", "$", issues),
    "$/retainedSurfaces",
    issues,
  );
  const readBackVerified = requireBoolean(receipt, "readBackVerified", "$", issues);
  if ((receipt.status === "deleted" || receipt.status === "not_found") && readBackVerified !== true) {
    pushIssue(
      issues,
      "deletion.readback_required",
      "$/readBackVerified",
      "deleted and not_found require verified readback",
    );
  }
  if (typeof receipt.createdAt === "string" && Number.isNaN(Date.parse(receipt.createdAt))) {
    pushIssue(issues, "contract.date_time", "$/createdAt", "must be an ISO date-time");
  }
  validateDigest(receipt.contentDigest, "$/contentDigest", issues);
  if (hasValidSha256Format(receipt.contentDigest)) {
    const expected = digestContentDocument(receipt);
    if (receipt.contentDigest !== expected) {
      pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidDeletionReceipt(value: unknown): asserts value is DeletionReceiptV1 {
  const result = validateDeletionReceipt(value);
  if (!result.valid) throw new EvaluationContractError("DeletionReceiptV1", result.issues);
}

export function validateRunManifest(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const manifest = requireRecord(value, "$", issues);
  if (manifest === undefined) return { valid: false, issues };
  ensureAllowedKeys(manifest, ["schemaVersion", "runId", "suite", "attempt", "profile", "createdAt", "contentDigest"], "$", issues);
  if (manifest.schemaVersion !== "evaluation-run-manifest.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-run-manifest.v1");
  }
  requireString(manifest, "runId", "$", issues);
  requireString(manifest, "createdAt", "$", issues);
  validateDigest(manifest.contentDigest, "$/contentDigest", issues);
  validateContentIdentity(manifest.suite, "$/suite", issues);
  const linked = validateAttemptAgainstProfile(manifest.attempt, manifest.profile);
  issues.push(...linked.issues.map((issue) => ({ ...issue, path: `$/attempt-profile${issue.path.slice(1)}` })));
  if (typeof manifest.createdAt === "string" && Number.isNaN(Date.parse(manifest.createdAt))) {
    pushIssue(issues, "contract.date_time", "$/createdAt", "must be an ISO date-time");
  }
  if (hasValidSha256Format(manifest.contentDigest)) {
    const expected = digestContentDocument(manifest);
    if (manifest.contentDigest !== expected) pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidRunManifest(value: unknown): asserts value is EvaluationRunManifestV1 {
  const result = validateRunManifest(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationRunManifestV1", result.issues);
}

export function validateSuite(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const record = requireRecord(value, "$", issues);
  if (record === undefined) return { valid: false, issues };
  ensureAllowedKeys(record, ["schemaVersion", "suiteId", "version", "contentDigest", "title", "purpose", "scenarios", "lineage"], "$", issues);
  if (record.schemaVersion !== "evaluation-suite.v1") {
    pushIssue(issues, "contract.schema_version", "$/schemaVersion", "must equal evaluation-suite.v1");
  }
  requireString(record, "suiteId", "$", issues);
  requireString(record, "version", "$", issues);
  requireString(record, "title", "$", issues);
  requireString(record, "purpose", "$", issues);
  validateDigest(record.contentDigest, "$/contentDigest", issues);
  const scenarioKeys: string[] = [];
  const scenarios = requireArray(record, "scenarios", "$", issues);
  if (scenarios.length === 0) pushIssue(issues, "contract.minimum_items", "$/scenarios", "must contain at least one scenario");
  scenarios.forEach((scenario, index) => {
    const path = `$/scenarios/${index}`;
    const registration = requireRecord(scenario, path, issues);
    if (registration === undefined) return;
    ensureAllowedKeys(
      registration,
      ["scenarioId", "revision", "contentDigest", "lifecycle", "adjudication", "criterionAdjudicationDigest", "partition", "dataClass"],
      path,
      issues,
    );
    const scenarioId = requireString(registration, "scenarioId", path, issues);
    const revision = requireString(registration, "revision", path, issues);
    if (scenarioId !== undefined && revision !== undefined) scenarioKeys.push(`${scenarioId}@${revision}`);
    validateDigest(registration.contentDigest, `${path}/contentDigest`, issues);
    ensureEnum(registration.lifecycle, LIFECYCLE_STATES, `${path}/lifecycle`, issues);
    ensureEnum(registration.adjudication, ADJUDICATION_STATES, `${path}/adjudication`, issues);
    validateDigest(registration.criterionAdjudicationDigest, `${path}/criterionAdjudicationDigest`, issues);
    ensureEnum(registration.partition, DATASET_PARTITIONS, `${path}/partition`, issues);
    ensureEnum(registration.dataClass, DATA_CLASSES, `${path}/dataClass`, issues);
  });
  if (new Set(scenarioKeys).size !== scenarioKeys.length) {
    pushIssue(issues, "suite.duplicate_scenario", "$/scenarios", "scenario revisions must be unique");
  }
  if (
    record.suiteId === "p0-release" &&
    scenarios.some((scenario) => isRecord(scenario) && scenario.partition !== "p0")
  ) {
    pushIssue(
      issues,
      "suite.p0_partition_required",
      "$/scenarios",
      "p0-release may contain only the disjoint p0 partition",
    );
  }
  validateScenarioLineage(record.lineage, "$/lineage", issues);
  if (hasValidSha256Format(record.contentDigest)) {
    const expected = digestContentDocument(record);
    if (record.contentDigest !== expected) {
      pushIssue(issues, "contract.digest_mismatch", "$/contentDigest", `must equal ${expected}`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export function assertValidSuite(value: unknown): asserts value is EvaluationSuiteV1 {
  const result = validateSuite(value);
  if (!result.valid) throw new EvaluationContractError("EvaluationSuiteV1", result.issues);
}

export interface ModelInputResolver {
  readModelInput(ref: FixtureReferenceV1): Promise<unknown>;
}

export interface ScenarioMaterializationResolver extends ModelInputResolver {
  readInitialState(ref: FixtureReferenceV1): Promise<unknown>;
  readOracle(ref: FixtureReferenceV1): Promise<unknown>;
}

export async function buildModelVisibleInput(
  document: EvaluationScenarioDocumentV1,
  resolver: ModelInputResolver,
): Promise<ScenarioModelInputV1> {
  assertValidScenarioDocument(document);
  const fixture = await resolver.readModelInput(document.modelInputRef);
  const issues: ValidationIssue[] = [];
  validateMaterializedFixtureDigest(document.modelInputRef, fixture, "$/modelInputRef/contentDigest", issues);
  const fixtureRecord = requireRecord(fixture, "$/modelInputFixture", issues);
  if (fixtureRecord !== undefined) {
    ensureAllowedKeys(fixtureRecord, ["schemaVersion", "fixtureId", "dataClass", "scenarioId", "input"], "$/modelInputFixture", issues);
    if (fixtureRecord.schemaVersion !== "evaluation-model-input.v1") {
      pushIssue(issues, "contract.schema_version", "$/modelInputFixture/schemaVersion", "must equal evaluation-model-input.v1");
    }
    if (fixtureRecord.fixtureId !== document.modelInputRef.fixtureId) {
      pushIssue(issues, "scenario.fixture_identity_mismatch", "$/modelInputFixture/fixtureId", "does not match modelInputRef");
    }
    if (fixtureRecord.scenarioId !== document.scenarioId) {
      pushIssue(issues, "scenario.fixture_scenario_mismatch", "$/modelInputFixture/scenarioId", "does not match Scenario");
    }
    ensureEnum(fixtureRecord.dataClass, ["synthetic_shareable", "synthetic_restricted"], "$/modelInputFixture/dataClass", issues);
    if (fixtureRecord.dataClass !== document.dataPolicy.dataClass) {
      pushIssue(issues, "scenario.fixture_data_class_mismatch", "$/modelInputFixture/dataClass", "does not match Scenario data policy");
    }
    if (!("input" in fixtureRecord)) pushIssue(issues, "contract.required", "$/modelInputFixture/input", "is required");
    scanModelInput(fixtureRecord.input, "$/input", new Set<string>(), issues);
  }
  if (issues.length > 0) throw new EvaluationContractError("ScenarioModelInputV1", issues);
  return canonicalizeJson(fixtureRecord?.input) as ScenarioModelInputV1;
}

export async function materializeScenario(
  document: EvaluationScenarioDocumentV1,
  resolver: ScenarioMaterializationResolver,
): Promise<EvaluationScenarioV1> {
  const [input, initialStateFixture, oracle] = await Promise.all([
    buildModelVisibleInput(document, resolver),
    resolver.readInitialState(document.initialStateRef),
    resolver.readOracle(document.oracleRef),
  ]);
  const fixtureIssues: ValidationIssue[] = [];
  validateMaterializedFixtureDigest(document.initialStateRef, initialStateFixture, "$/initialStateRef/contentDigest", fixtureIssues);
  validateMaterializedFixtureDigest(document.oracleRef, oracle, "$/oracleRef/contentDigest", fixtureIssues);
  const initialStateRecord = requireRecord(initialStateFixture, "$/initialStateFixture", fixtureIssues);
  if (initialStateRecord !== undefined) {
    ensureAllowedKeys(initialStateRecord, ["schemaVersion", "fixtureId", "scenarioId", "state"], "$/initialStateFixture", fixtureIssues);
    if (initialStateRecord.schemaVersion !== "evaluation-initial-state.v1") {
      pushIssue(fixtureIssues, "contract.schema_version", "$/initialStateFixture/schemaVersion", "must equal evaluation-initial-state.v1");
    }
    if (initialStateRecord.fixtureId !== document.initialStateRef.fixtureId) {
      pushIssue(fixtureIssues, "scenario.fixture_identity_mismatch", "$/initialStateFixture/fixtureId", "does not match initialStateRef");
    }
    if (initialStateRecord.scenarioId !== document.scenarioId) {
      pushIssue(fixtureIssues, "scenario.fixture_scenario_mismatch", "$/initialStateFixture/scenarioId", "does not match Scenario");
    }
    if (!("state" in initialStateRecord)) pushIssue(fixtureIssues, "contract.required", "$/initialStateFixture/state", "is required");
  }
  const oracleRecord = isRecord(oracle) ? oracle : undefined;
  if (oracleRecord?.scenarioId !== document.scenarioId) {
    pushIssue(fixtureIssues, "scenario.oracle_scenario_mismatch", "$/oracle/scenarioId", "does not match Scenario");
  }
  if (oracleRecord?.oracleId !== document.oracleRef.fixtureId) {
    pushIssue(fixtureIssues, "scenario.fixture_identity_mismatch", "$/oracle/oracleId", "does not match oracleRef");
  }
  if (fixtureIssues.length > 0) throw new EvaluationContractError("Scenario fixtures", fixtureIssues);
  const materialized = {
    ...document,
    input,
    initialState: canonicalizeJson(initialStateRecord?.state) as ScenarioInitialStateV1,
    oracle: canonicalizeJson(oracle) as unknown as ScenarioOracleV1,
  };
  assertValidMaterializedScenario(materialized);
  return materialized;
}
