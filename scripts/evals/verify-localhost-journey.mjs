import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = resolve(
  repositoryRoot,
  process.argv[2] ?? "docs/evaluations/overnight/final/run-manifest.json"
);
const contractPath = resolve(
  repositoryRoot,
  "evals/overnight-cross-surface-v1.json"
);
const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function exactSet(actual, expected, label) {
  check(Array.isArray(actual), `${label} must be an array`);
  if (!Array.isArray(actual)) {
    return;
  }
  const actualSet = new Set(actual);
  check(actualSet.size === actual.length, `${label} contains duplicates`);
  check(
    actualSet.size === expected.length &&
      expected.every((value) => actualSet.has(value)),
    `${label} must contain exactly: ${expected.join(", ")}`
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveArtifactPath(locator) {
  const path = isAbsolute(locator)
    ? locator
    : resolve(repositoryRoot, locator);
  const relativePath = relative(repositoryRoot, path);
  check(
    !relativePath.startsWith("..") && !isAbsolute(relativePath),
    `artifact locator escapes the repository: ${locator}`
  );
  check(
    relativePath.startsWith("docs/evaluations/overnight/"),
    `artifact locator is outside docs/evaluations/overnight: ${locator}`
  );
  return path;
}

function normalizedState(value) {
  return {
    account_id: value?.account_id,
    episode_id: value?.episode_id,
    assignment_id: value?.assignment_id,
    confirmed_state_id: value?.confirmed_state_id,
    confirmed_state_version: value?.confirmed_state_version,
    assertions: [...(value?.assertions ?? [])]
      .map((assertion) => ({
        field: assertion.field,
        value: assertion.value,
        status: assertion.status,
        evidence_message_id: assertion.evidence_message_id
      }))
      .sort((left, right) => left.field.localeCompare(right.field))
  };
}

function validateStateParity(value, traceId) {
  check(value.trace_id === traceId, "state-parity trace_id does not match");
  for (const source of ["backend", "web", "ios"]) {
    check(
      value.sources && typeof value.sources[source] === "object",
      `state-parity is missing ${source}`
    );
  }
  const backend = normalizedState(value.sources?.backend);
  const web = normalizedState(value.sources?.web);
  const ios = normalizedState(value.sources?.ios);
  check(
    JSON.stringify(web) === JSON.stringify(backend),
    "Web confirmed state differs from backend state"
  );
  check(
    JSON.stringify(ios) === JSON.stringify(backend),
    "iOS confirmed state differs from backend state"
  );
  check(
    backend.account_id === "account-a",
    "state parity must use the local simulated account-a"
  );
  check(
    backend.assertions.length === 4,
    "TS-CORE-01 parity must include four confirmed assertions"
  );
  check(
    value.proposed_and_confirmed_visibly_distinct === true,
    "state-parity must record visible proposed/confirmed distinction"
  );
}

function validateApprovalSeparation(value, traceId) {
  check(
    value.trace_id === traceId,
    "approval-separation trace_id does not match"
  );
  check(
    nonEmptyString(value.fact_confirmation?.event_id),
    "fact confirmation requires an event ID"
  );
  check(
    value.fact_confirmation?.scope === "fact_confirmation",
    "fact confirmation scope is invalid"
  );
  check(
    nonEmptyString(value.action_approval?.event_id),
    "action approval requires an event ID"
  );
  check(
    value.action_approval?.scope === "action_approval",
    "action approval scope is invalid"
  );
  check(
    value.fact_confirmation?.event_id !== value.action_approval?.event_id,
    "fact confirmation and action approval event IDs must differ"
  );
  check(
    nonEmptyString(value.action_approval?.proposal_version) &&
      nonEmptyString(value.action_approval?.target) &&
      nonEmptyString(value.action_approval?.effect),
    "action approval must name proposal version, exact target, and exact effect"
  );
  check(
    value.effect_count_after_fact_confirmation === 0,
    "fact confirmation alone must produce zero effects"
  );
  check(
    value.action_proposal_status_after_fact_confirmation === "unapproved",
    "action must remain unapproved after fact confirmation"
  );
  check(
    value.confirmed_facts_intact_after_action_decline === true,
    "declining an action must preserve confirmed facts"
  );
}

function validateEffectReadback(value, traceId) {
  check(value.trace_id === traceId, "effect-readback trace_id does not match");
  check(
    nonEmptyString(value.idempotency_key),
    "effect-readback requires an idempotency key"
  );
  check(
    Array.isArray(value.attempts) && value.attempts.length === 2,
    "effect-readback requires exactly two attempts"
  );
  check(
    (value.attempts ?? []).every(
      (attempt) => attempt.idempotency_key === value.idempotency_key
    ),
    "both attempts must use the same idempotency key"
  );
  check(
    Array.isArray(value.destination_objects) &&
      value.destination_objects.length === 1,
    "the local destination must contain exactly one effect object"
  );
  const destinationId = value.destination_objects?.[0]?.external_object_id;
  check(
    nonEmptyString(destinationId),
    "the local destination object requires an external_object_id"
  );
  check(
    (value.attempts ?? []).every(
      (attempt) => attempt.external_object_id === destinationId
    ),
    "both attempts must reconcile to the same destination object"
  );
  check(
    value.observed_readback?.external_object_id === destinationId &&
      value.observed_readback?.matches_approved_effect === true,
    "observed readback must match the one approved local effect"
  );
  check(
    value.ui_result_status === "verified",
    "the UI may report only a verified result after readback"
  );
}

function validateRecoveryMatrix(value, traceId, requiredVariants) {
  check(value.trace_id === traceId, "recovery-matrix trace_id does not match");
  const variants = value.variants ?? [];
  exactSet(
    variants.map((variant) => variant.id),
    requiredVariants,
    "recovery variant IDs"
  );
  for (const variant of variants) {
    check(variant.status === "pass", `${variant.id} must pass`);
    check(
      variant.false_success === false,
      `${variant.id} must not report false success`
    );
    check(
      variant.duplicate_effect === false,
      `${variant.id} must not duplicate an effect`
    );
    check(
      nonEmptyString(variant.state_disposition),
      `${variant.id} must name the preserved, deleted, or denied state`
    );
    check(
      Array.isArray(variant.evidence_locators) &&
        variant.evidence_locators.length > 0 &&
        variant.evidence_locators.every(nonEmptyString),
      `${variant.id} requires direct evidence locators`
    );
  }
}

if (process.argv[2] === "--self-test") {
  const traceId = "TS-CORE-01-localhost";
  const assertions = [
    "competing_process",
    "decision_deadline",
    "availability",
    "work_mode_preference"
  ].map((field) => ({
    field,
    value: `example-${field}`,
    status: "confirmed",
    evidence_message_id: "m1"
  }));
  const state = {
    account_id: "account-a",
    episode_id: "episode-example",
    assignment_id: "assignment-example",
    confirmed_state_id: "state-example",
    confirmed_state_version: "1",
    assertions
  };
  const validStateParity = {
    trace_id: traceId,
    sources: {
      backend: state,
      web: cloneForSelfTest(state),
      ios: cloneForSelfTest(state)
    },
    proposed_and_confirmed_visibly_distinct: true
  };
  const validApproval = {
    trace_id: traceId,
    fact_confirmation: {
      event_id: "fact-event",
      scope: "fact_confirmation"
    },
    action_approval: {
      event_id: "action-event",
      scope: "action_approval",
      proposal_version: "1",
      target: "local destination",
      effect: "create local reminder"
    },
    effect_count_after_fact_confirmation: 0,
    action_proposal_status_after_fact_confirmation: "unapproved",
    confirmed_facts_intact_after_action_decline: true
  };
  const validEffect = {
    trace_id: traceId,
    idempotency_key: "idempotency-example",
    attempts: [
      {
        idempotency_key: "idempotency-example",
        external_object_id: "effect-example"
      },
      {
        idempotency_key: "idempotency-example",
        external_object_id: "effect-example"
      }
    ],
    destination_objects: [
      {
        external_object_id: "effect-example"
      }
    ],
    observed_readback: {
      external_object_id: "effect-example",
      matches_approved_effect: true
    },
    ui_result_status: "verified"
  };
  const variants = [
    "offline",
    "timeout_after_effect",
    "permission_revocation",
    "deletion_cascade",
    "cross_account_denial"
  ];
  const validRecovery = {
    trace_id: traceId,
    variants: variants.map((id) => ({
      id,
      status: "pass",
      false_success: false,
      duplicate_effect: false,
      state_disposition: "safe example state",
      evidence_locators: [`example://${id}`]
    }))
  };

  validateStateParity(validStateParity, traceId);
  validateApprovalSeparation(validApproval, traceId);
  validateEffectReadback(validEffect, traceId);
  validateRecoveryMatrix(validRecovery, traceId, variants);
  if (errors.length > 0) {
    console.error("Integrated validator rejected valid self-test fixtures:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const invalidParity = cloneForSelfTest(validStateParity);
  invalidParity.sources.ios.confirmed_state_version = "2";
  const parityErrors = captureSelfTestErrors(() =>
    validateStateParity(invalidParity, traceId)
  );
  const invalidEffect = cloneForSelfTest(validEffect);
  invalidEffect.destination_objects.push({
    external_object_id: "duplicate-example"
  });
  const effectErrors = captureSelfTestErrors(() =>
    validateEffectReadback(invalidEffect, traceId)
  );
  if (
    !parityErrors.some((error) => error.includes("iOS confirmed state")) ||
    !effectErrors.some((error) => error.includes("exactly one effect object"))
  ) {
    console.error(
      "Integrated validator self-test did not reject parity and duplicate-effect failures."
    );
    process.exit(1);
  }
  console.log(
    "Integrated localhost journey validator self-test passed: valid trace accepted; parity and duplicate-effect failures rejected."
  );
  process.exit(0);
}

function cloneForSelfTest(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureSelfTestErrors(callback) {
  const start = errors.length;
  callback();
  return errors.splice(start);
}

const [manifest, contract] = await Promise.all([
  readJson(manifestPath),
  readJson(contractPath)
]);
const expectedAssertions = contract.cross_surface_assertions.map(
  (assertion) => assertion.id
);
const requiredArtifacts = contract.ts_core_01_evidence.required_artifacts;
const requiredArtifactIds = requiredArtifacts.map((artifact) => artifact.id);
const requiredVariants = contract.cross_surface_assertions.find(
  (assertion) => assertion.id === "XS-RECOVERY-01"
)?.required_variants;
const traceId = contract.ts_core_01_evidence.trace_id;

check(
  manifest.review_object_id === "integrated_localhost_journey",
  "manifest must describe integrated_localhost_journey"
);
check(
  manifest.base_commit === contract.base_commit,
  "manifest base_commit does not match the frozen contract"
);
check(
  manifest.data_classification?.mode === "synthetic_fixture_only" &&
    manifest.data_classification?.contains_live_candidate_data === false &&
    manifest.data_classification?.live_external_writes === false,
  "manifest must prove synthetic-only data and no live writes"
);
check(
  (manifest.command_results ?? []).every(
    (result) => result.status === "pass" && result.exit_code === 0
  ),
  "every integrated command result must pass with exit code 0"
);

const coreCaseResults = manifest.core_case_results ?? [];
exactSet(
  coreCaseResults.map((result) => result.case_id),
  contract.core_suite.case_ids,
  "integrated core case result IDs"
);
for (const result of coreCaseResults) {
  check(result.status === "pass", `${result.case_id} must pass`);
  check(
    Array.isArray(result.evidence_locators) &&
      result.evidence_locators.length > 0 &&
      result.evidence_locators.every(nonEmptyString),
    `${result.case_id} requires deterministic evidence locators`
  );
  check(
    result.exact_gap === null,
    `${result.case_id} pass requires a null exact_gap`
  );
}

const assertionResults = manifest.assertion_results ?? [];
exactSet(
  assertionResults.map((result) => result.assertion_id),
  expectedAssertions,
  "integrated assertion result IDs"
);
for (const result of assertionResults) {
  check(result.status === "pass", `${result.assertion_id} must pass`);
  check(
    Array.isArray(result.evidence_locators) &&
      result.evidence_locators.length > 0 &&
      result.evidence_locators.every(nonEmptyString),
    `${result.assertion_id} requires direct evidence locators`
  );
  check(
    result.exact_gap === null,
    `${result.assertion_id} pass requires a null exact_gap`
  );
}

const artifacts = new Map(
  (manifest.artifacts ?? []).map((artifact) => [artifact.id, artifact])
);
exactSet([...artifacts.keys()], requiredArtifactIds, "integrated artifact IDs");

for (const required of requiredArtifacts) {
  const artifact = artifacts.get(required.id);
  check(
    artifact?.type === required.type,
    `${required.id} type does not match the contract`
  );
  check(
    /^[0-9a-f]{64}$/.test(artifact?.sha256 ?? ""),
    `${required.id} requires a SHA-256 digest`
  );
  if (!artifact || !nonEmptyString(artifact.locator)) {
    errors.push(`${required.id} requires an artifact locator`);
    continue;
  }
  const artifactPath = resolveArtifactPath(artifact.locator);
  try {
    const bytes = await readFile(artifactPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    check(digest === artifact.sha256, `${required.id} SHA-256 does not match`);
  } catch (error) {
    errors.push(`${required.id} cannot be read: ${error.message}`);
  }
}

for (const [artifactId, validator] of [
  ["state-parity", validateStateParity],
  ["approval-separation", validateApprovalSeparation],
  ["effect-readback", validateEffectReadback]
]) {
  const artifact = artifacts.get(artifactId);
  if (artifact?.locator) {
    try {
      validator(await readJson(resolveArtifactPath(artifact.locator)), traceId);
    } catch (error) {
      errors.push(`${artifactId} JSON cannot be validated: ${error.message}`);
    }
  }
}

const recoveryArtifact = artifacts.get("recovery-matrix");
if (recoveryArtifact?.locator) {
  try {
    validateRecoveryMatrix(
      await readJson(resolveArtifactPath(recoveryArtifact.locator)),
      traceId,
      requiredVariants
    );
  } catch (error) {
    errors.push(`recovery-matrix JSON cannot be validated: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`Integrated localhost journey validation failed (${errors.length}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Integrated localhost journey passed: ${expectedAssertions.length} assertions, ${requiredArtifacts.length} frozen artifacts, ${requiredVariants.length} recovery variants.`
);
