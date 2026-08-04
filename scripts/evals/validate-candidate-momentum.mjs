import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = {
  suite: null,
  manifest: null,
  craftReview: null
};
const commandLineArguments = process.argv.slice(2);
for (let index = 0; index < commandLineArguments.length; index += 1) {
  const argument = commandLineArguments[index];
  if (["--suite", "--manifest", "--craft-review"].includes(argument)) {
    const value = commandLineArguments[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a path`);
    }
    const key =
      argument === "--suite"
        ? "suite"
        : argument === "--manifest"
          ? "manifest"
          : "craftReview";
    cli[key] = resolve(repositoryRoot, value);
    index += 1;
  } else if (!argument.startsWith("--") && cli.suite === null) {
    cli.suite = resolve(repositoryRoot, argument);
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}
const paths = {
  suite: cli.suite ?? resolve(repositoryRoot, "evals/candidate-momentum-v1.json"),
  contract: resolve(repositoryRoot, "evals/overnight-cross-surface-v1.json"),
  craftRubric: resolve(repositoryRoot, "evals/web-browser-craft-v1.json"),
  manifestSchema: resolve(
    repositoryRoot,
    "evals/schemas/overnight-run-manifest.schema.json"
  ),
  craftSchema: resolve(
    repositoryRoot,
    "evals/schemas/web-browser-craft-review.schema.json"
  ),
  manifestExample: resolve(
    repositoryRoot,
    "evals/examples/overnight-run-manifest.example.json"
  ),
  craftExample: resolve(
    repositoryRoot,
    "evals/examples/web-browser-craft-review.example.json"
  ),
  specialistExample: resolve(
    repositoryRoot,
    "evals/examples/specialist-review.example.json"
  ),
  panelExample: resolve(
    repositoryRoot,
    "evals/examples/panel-review.example.json"
  ),
  journeyValidator: resolve(
    repositoryRoot,
    "scripts/evals/verify-localhost-journey.mjs"
  ),
  adjudicatorValidator: resolve(
    repositoryRoot,
    ".agent/skills/product-adjudicator/scripts/validate_review.py"
  )
};

const EXPECTED_CORE_CASES = [
  "TS-CORE-01",
  "TS-CORE-02",
  "TS-CORE-03",
  "TS-CORE-04",
  "TS-ID-01",
  "TS-ID-03",
  "TS-ACT-01",
  "TS-BOUND-01"
];
const EXPECTED_REVIEW_OBJECTS = [
  "codex_plugin",
  "chrome_browser_extension",
  "web",
  "ios",
  "backend_control_plane",
  "integrated_localhost_journey"
];
const EXPECTED_ASSERTIONS = [
  "XS-CAPTURE-01",
  "XS-AUTH-01",
  "XS-PERSIST-01",
  "XS-STATE-01",
  "XS-AUTHORITY-01",
  "XS-EFFECT-01",
  "XS-RECOVERY-01",
  "XS-LABEL-01",
  "XS-DATA-01"
];
const EXPECTED_RECOVERY_VARIANTS = [
  "offline",
  "timeout_after_effect",
  "permission_revocation",
  "deletion_cascade",
  "cross_account_denial"
];
const EXPECTED_TS_CORE_01_ARTIFACTS = [
  "chrome-capture-recording",
  "backend-canonical-trace",
  "web-review-sequence",
  "ios-review-sequence",
  "state-parity",
  "approval-separation",
  "effect-readback",
  "recovery-matrix"
];
const EXPECTED_CRAFT_DIMENSIONS = [
  "product_specificity",
  "narrative_clarity",
  "attention_hierarchy",
  "evidence_proximity",
  "typography",
  "spacing_rhythm",
  "restrained_color_state_semantics",
  "materiality",
  "interaction_motion",
  "responsive_composition",
  "keyboard_focus_accessibility",
  "loading_empty_error_recovery"
];
const EXPECTED_ANCHORS = [0, 80, 95, 98, 100];
const ALLOWED_DISPOSITIONS = new Set([
  "propose_action",
  "no_action",
  "clarify",
  "block"
]);
const ALLOWED_STATUSES = new Set(["proposed", "ambiguous", "superseded"]);

function check(condition, errors, message) {
  if (!condition) {
    errors.push(message);
  }
}

function checkString(value, errors, path) {
  check(
    typeof value === "string" && value.trim().length > 0,
    errors,
    `${path} must be a non-empty string`
  );
}

function checkStringArray(value, errors, path, { nonEmpty = true } = {}) {
  check(Array.isArray(value), errors, `${path} must be an array`);
  if (!Array.isArray(value)) {
    return;
  }
  if (nonEmpty) {
    check(value.length > 0, errors, `${path} must not be empty`);
  }
  value.forEach((item, index) =>
    checkString(item, errors, `${path}[${index}]`)
  );
}

function checkAllowedKeys(value, allowed, errors, path) {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    errors,
    `${path} must be an object`
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    check(
      allowed.includes(key),
      errors,
      `${path}.${key} is not allowed`
    );
  }
}

function checkExactSet(actual, expected, errors, path) {
  check(Array.isArray(actual), errors, `${path} must be an array`);
  if (!Array.isArray(actual)) {
    return;
  }
  const actualSet = new Set(actual);
  check(
    actualSet.size === actual.length,
    errors,
    `${path} must not contain duplicates`
  );
  check(
    actualSet.size === expected.length &&
      expected.every((value) => actualSet.has(value)),
    errors,
    `${path} must contain exactly: ${expected.join(", ")}`
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateCoreSuite(suite) {
  const errors = [];
  checkString(suite.suite_id, errors, "suite.suite_id");
  checkString(suite.version, errors, "suite.version");
  check(
    suite.suite_id === "talent-signal-candidate-momentum-v1",
    errors,
    "suite.suite_id must remain talent-signal-candidate-momentum-v1"
  );
  check(
    suite.version === "2026-08-05.1",
    errors,
    "suite.version must remain frozen at 2026-08-05.1"
  );
  checkExactSet(
    suite.surfaces,
    ["plugin", "web", "ios"],
    errors,
    "suite.surfaces"
  );

  check(
    Array.isArray(suite.cases) && suite.cases.length === 8,
    errors,
    "the small core suite must contain exactly eight cases"
  );
  const caseIds = (suite.cases ?? []).map((testCase) => testCase.id);
  checkExactSet(caseIds, EXPECTED_CORE_CASES, errors, "suite case IDs");

  for (const testCase of suite.cases ?? []) {
    const prefix = testCase.id ?? "<missing-id>";
    checkString(testCase.id, errors, `${prefix}.id`);
    checkString(testCase.title, errors, `${prefix}.title`);
    check(
      Array.isArray(testCase.messages) && testCase.messages.length > 0,
      errors,
      `${prefix}.messages must be non-empty`
    );
    check(
      testCase.expected &&
        ALLOWED_DISPOSITIONS.has(testCase.expected.disposition),
      errors,
      `${prefix}.expected.disposition is invalid`
    );
    check(
      Array.isArray(testCase.expected?.assertions),
      errors,
      `${prefix}.expected.assertions must be an array`
    );
    checkStringArray(
      testCase.expected?.must_not,
      errors,
      `${prefix}.expected.must_not`
    );

    if (
      ["no_action", "clarify", "block"].includes(
        testCase.expected?.disposition
      )
    ) {
      check(
        testCase.expected.action === null,
        errors,
        `${prefix}: ${testCase.expected.disposition} cases cannot contain an action`
      );
    }

    if (testCase.expected?.disposition === "propose_action") {
      check(
        testCase.expected.action?.type === "prepare_question",
        errors,
        `${prefix}: the core suite only permits prepare_question actions`
      );
    }

    const messages = new Map(
      (testCase.messages ?? []).map((message) => [message.id, message])
    );
    check(
      messages.size === (testCase.messages ?? []).length,
      errors,
      `${prefix}.messages must have unique IDs`
    );

    for (const assertion of testCase.expected?.assertions ?? []) {
      check(
        ALLOWED_STATUSES.has(assertion.status),
        errors,
        `${prefix}: assertion ${assertion.field} has an invalid status`
      );
      const source = messages.get(assertion.evidence_message_id);
      check(
        Boolean(source),
        errors,
        `${prefix}: assertion ${assertion.field} references a missing message`
      );
      check(
        source?.text.includes(assertion.evidence_quote),
        errors,
        `${prefix}: assertion ${assertion.field} quote is not present in its message`
      );
    }

    if (testCase.expected?.action) {
      const action = testCase.expected.action;
      checkStringArray(
        action.evidence_message_ids,
        errors,
        `${prefix}.expected.action.evidence_message_ids`
      );
      for (const messageId of action.evidence_message_ids ?? []) {
        check(
          messages.has(messageId),
          errors,
          `${prefix}: action references missing message ${messageId}`
        );
      }
    }
  }

  const coreOne = (suite.cases ?? []).find(
    (testCase) => testCase.id === "TS-CORE-01"
  );
  check(
    coreOne?.messages?.length === 1 &&
      coreOne.messages[0].id === "m1" &&
      coreOne.messages[0].speaker === "candidate" &&
      coreOne.messages[0].text ===
        "I have another offer and need to decide Wednesday. I can speak Tuesday afternoon, but remote matters a lot.",
    errors,
    "TS-CORE-01 source evidence must remain frozen"
  );
  checkExactSet(
    (coreOne?.expected?.assertions ?? []).map((assertion) => assertion.field),
    [
      "competing_process",
      "decision_deadline",
      "availability",
      "work_mode_preference"
    ],
    errors,
    "TS-CORE-01 assertion fields"
  );
  check(
    coreOne?.expected?.action?.target === "client remote-work policy",
    errors,
    "TS-CORE-01 action target must remain client remote-work policy"
  );
  check(
    coreOne?.expected?.must_not?.includes("predict acceptance") &&
      coreOne.expected.must_not.includes(
        "convert availability into meeting consent"
      ) &&
      coreOne.expected.must_not.includes(
        "present proposed assertions as confirmed"
      ),
    errors,
    "TS-CORE-01 must preserve its three assessment, consent, and state guardrails"
  );

  return errors;
}

function validateCrossSurfaceContract(contract, suite) {
  const errors = [];
  check(
    contract.contract_id === "talent-signal-overnight-cross-surface-v1",
    errors,
    "contract.contract_id is invalid"
  );
  check(
    contract.base_commit === "f66581cbf8a1b1154156fc25231a6ff82f11c61f",
    errors,
    "contract.base_commit must be the frozen main commit"
  );
  check(
    contract.core_suite?.path === "evals/candidate-momentum-v1.json" &&
      contract.core_suite?.suite_id === suite.suite_id &&
      contract.core_suite?.version === suite.version,
    errors,
    "contract.core_suite must reference the frozen core fixture"
  );
  checkExactSet(
    contract.core_suite?.case_ids,
    EXPECTED_CORE_CASES,
    errors,
    "contract.core_suite.case_ids"
  );
  check(
    contract.data_policy?.mode === "synthetic_fixture_only" &&
      contract.data_policy?.contains_live_candidate_data === false,
    errors,
    "contract data policy must prohibit live candidate data"
  );
  checkStringArray(
    contract.data_policy?.allowed_sources,
    errors,
    "contract.data_policy.allowed_sources"
  );
  checkStringArray(
    contract.data_policy?.prohibited_sources,
    errors,
    "contract.data_policy.prohibited_sources"
  );

  const objects = new Map();
  for (const object of contract.review_objects ?? []) {
    checkString(object.id, errors, "review_object.id");
    check(!objects.has(object.id), errors, `duplicate review object ${object.id}`);
    objects.set(object.id, object);
    checkString(object.label, errors, `${object.id}.label`);
    checkString(object.kind, errors, `${object.id}.kind`);
    checkString(
      object.source_ownership,
      errors,
      `${object.id}.source_ownership`
    );
    checkString(object.artifact_root, errors, `${object.id}.artifact_root`);
    checkStringArray(
      object.required_command_ids,
      errors,
      `${object.id}.required_command_ids`
    );
  }
  checkExactSet(
    [...objects.keys()],
    EXPECTED_REVIEW_OBJECTS,
    errors,
    "contract review object IDs"
  );

  const commands = new Map();
  for (const command of contract.commands ?? []) {
    checkString(command.id, errors, "command.id");
    check(!commands.has(command.id), errors, `duplicate command ${command.id}`);
    commands.set(command.id, command);
    check(
      objects.has(command.review_object),
      errors,
      `${command.id}.review_object is unknown`
    );
    checkString(command.command, errors, `${command.id}.command`);
    checkString(command.purpose, errors, `${command.id}.purpose`);
  }
  for (const [objectId, object] of objects) {
    for (const commandId of object.required_command_ids ?? []) {
      check(
        commands.get(commandId)?.review_object === objectId,
        errors,
        `${objectId} required command ${commandId} is missing or belongs to another object`
      );
    }
  }

  const assertions = new Map();
  for (const assertion of contract.cross_surface_assertions ?? []) {
    checkString(assertion.id, errors, "assertion.id");
    check(
      !assertions.has(assertion.id),
      errors,
      `duplicate assertion ${assertion.id}`
    );
    assertions.set(assertion.id, assertion);
    checkString(assertion.title, errors, `${assertion.id}.title`);
    checkString(assertion.behavior, errors, `${assertion.id}.behavior`);
    checkString(
      assertion.pass_condition,
      errors,
      `${assertion.id}.pass_condition`
    );
    check(
      assertion.fixture_case_id === "TS-CORE-01",
      errors,
      `${assertion.id} must execute against TS-CORE-01`
    );
    checkStringArray(
      assertion.review_objects,
      errors,
      `${assertion.id}.review_objects`
    );
    for (const objectId of assertion.review_objects ?? []) {
      check(
        objects.has(objectId),
        errors,
        `${assertion.id} references unknown review object ${objectId}`
      );
    }
    checkStringArray(
      assertion.evidence_requirements,
      errors,
      `${assertion.id}.evidence_requirements`
    );
    checkStringArray(
      assertion.veto_domains,
      errors,
      `${assertion.id}.veto_domains`
    );
  }
  checkExactSet(
    [...assertions.keys()],
    EXPECTED_ASSERTIONS,
    errors,
    "contract assertion IDs"
  );
  checkExactSet(
    assertions.get("XS-RECOVERY-01")?.required_variants,
    EXPECTED_RECOVERY_VARIANTS,
    errors,
    "XS-RECOVERY-01.required_variants"
  );
  check(
    assertions
      .get("XS-CAPTURE-01")
      ?.behavior.toLowerCase()
      .includes("active tab") &&
      assertions.get("XS-CAPTURE-01")?.behavior.includes("Submit"),
    errors,
    "XS-CAPTURE-01 must require active-tab capture and explicit Submit"
  );
  check(
    assertions.get("XS-AUTHORITY-01")?.behavior.includes(
      "Confirming selected facts"
    ) &&
      assertions.get("XS-AUTHORITY-01")?.behavior.includes("separate"),
    errors,
    "XS-AUTHORITY-01 must separate fact confirmation from action approval"
  );
  check(
    assertions.get("XS-EFFECT-01")?.behavior.includes("idempotency key") &&
      assertions.get("XS-EFFECT-01")?.behavior.includes("read back"),
    errors,
    "XS-EFFECT-01 must require idempotency and observed readback"
  );

  check(
    contract.ts_core_01_evidence?.trace_id === "TS-CORE-01-localhost",
    errors,
    "TS-CORE-01 trace ID must be frozen"
  );
  checkExactSet(
    contract.ts_core_01_evidence?.state_identity_keys,
    [
      "account_id",
      "episode_id",
      "assignment_id",
      "confirmed_state_id",
      "confirmed_state_version"
    ],
    errors,
    "TS-CORE-01 state identity keys"
  );
  const artifactIds = (
    contract.ts_core_01_evidence?.required_artifacts ?? []
  ).map((artifact) => artifact.id);
  checkExactSet(
    artifactIds,
    EXPECTED_TS_CORE_01_ARTIFACTS,
    errors,
    "TS-CORE-01 required artifact IDs"
  );
  for (const artifact of
    contract.ts_core_01_evidence?.required_artifacts ?? []) {
    check(
      objects.has(artifact.review_object),
      errors,
      `${artifact.id}.review_object is unknown`
    );
    checkString(artifact.type, errors, `${artifact.id}.type`);
    checkString(
      artifact.locator_pattern,
      errors,
      `${artifact.id}.locator_pattern`
    );
  }
  checkString(
    contract.ts_core_01_evidence?.pass_condition,
    errors,
    "contract.ts_core_01_evidence.pass_condition"
  );
  return errors;
}

function validateCraftRubric(rubric) {
  const errors = [];
  check(
    rubric.rubric_id === "talent-signal-web-browser-craft-v1",
    errors,
    "craft rubric ID is invalid"
  );
  checkExactSet(
    rubric.scope,
    ["chrome_browser_extension", "web", "integrated_localhost_journey"],
    errors,
    "craft rubric scope"
  );
  const rules = rubric.rules ?? {};
  check(
    rules.dimension_score_min === 0 &&
      rules.dimension_score_max === 100 &&
      rules.dimension_pass_threshold === 98 &&
      rules.integrated_journey_target === 95 &&
      rules.direct_evidence_required_at_or_above === 98,
    errors,
    "craft score thresholds must remain 0-100, >=98 per dimension, and >=95 for the journey"
  );
  check(
    rules.average_scores === false &&
      rules.vetoes_take_precedence === true &&
      rules.exact_gap_required_below_target === true &&
      rules.not_applicable_requires_reason === true &&
      rules.journey_score_is_independent === true,
    errors,
    "craft rules must prohibit averages, preserve vetoes, and require exact gaps"
  );
  checkExactSet(
    (rubric.journey_anchors ?? []).map((anchor) => anchor.score),
    [0, 80, 90, 95, 100],
    errors,
    "craft journey anchor scores"
  );
  for (const anchor of rubric.journey_anchors ?? []) {
    checkString(anchor.behavior, errors, `journey anchor ${anchor.score}`);
  }

  const dimensions = new Map();
  for (const dimension of rubric.dimensions ?? []) {
    checkString(dimension.id, errors, "craft dimension.id");
    check(
      !dimensions.has(dimension.id),
      errors,
      `duplicate craft dimension ${dimension.id}`
    );
    dimensions.set(dimension.id, dimension);
    checkString(dimension.label, errors, `${dimension.id}.label`);
    checkString(dimension.question, errors, `${dimension.id}.question`);
    checkExactSet(
      (dimension.anchors ?? []).map((anchor) => anchor.score),
      EXPECTED_ANCHORS,
      errors,
      `${dimension.id}.anchor scores`
    );
    for (const anchor of dimension.anchors ?? []) {
      checkString(
        anchor.behavior,
        errors,
        `${dimension.id}.anchor[${anchor.score}]`
      );
    }
    checkStringArray(
      dimension.direct_evidence_required,
      errors,
      `${dimension.id}.direct_evidence_required`
    );
  }
  checkExactSet(
    [...dimensions.keys()],
    EXPECTED_CRAFT_DIMENSIONS,
    errors,
    "craft dimension IDs"
  );
  return errors;
}

function validateSchemaDocuments(manifestSchema, craftSchema) {
  const errors = [];
  for (const [name, schema] of [
    ["manifest schema", manifestSchema],
    ["craft schema", craftSchema]
  ]) {
    check(
      schema.$schema === "https://json-schema.org/draft/2020-12/schema",
      errors,
      `${name} must use JSON Schema draft 2020-12`
    );
    check(schema.type === "object", errors, `${name} root must be an object`);
    check(
      schema.additionalProperties === false,
      errors,
      `${name} must reject undeclared root fields`
    );
    checkStringArray(schema.required, errors, `${name}.required`);
  }
  check(
    manifestSchema.properties?.base_commit?.const ===
      "f66581cbf8a1b1154156fc25231a6ff82f11c61f",
    errors,
    "manifest schema must freeze the base commit"
  );
  check(
    manifestSchema.properties?.data_classification?.properties
      ?.contains_live_candidate_data?.const === false &&
      manifestSchema.properties?.data_classification?.properties
        ?.live_external_writes?.const === false,
    errors,
    "manifest schema must reject live candidate data and live writes"
  );
  check(
    craftSchema.properties?.findings?.maxItems === 3,
    errors,
    "craft schema must allow no more than three findings"
  );
  return errors;
}

function validateRunManifest(
  manifest,
  suite,
  contract,
  { allowExample = true } = {}
) {
  const errors = [];
  checkAllowedKeys(
    manifest,
    [
      "run_id",
      "review_object_id",
      "base_commit",
      "result_commit",
      "environment",
      "fixture",
      "data_classification",
      "core_case_results",
      "command_results",
      "artifacts",
      "assertion_results",
      "untested_behavior"
    ],
    errors,
    "manifest"
  );
  checkString(manifest.run_id, errors, "manifest.run_id");
  if (!allowExample) {
    check(
      !manifest.run_id?.startsWith("EXAMPLE"),
      errors,
      "submitted manifest run_id must not be an example"
    );
  }
  check(
    EXPECTED_REVIEW_OBJECTS.includes(manifest.review_object_id),
    errors,
    "manifest.review_object_id is invalid"
  );
  check(
    manifest.base_commit === contract.base_commit,
    errors,
    "manifest.base_commit does not match the contract"
  );
  check(
    /^[0-9a-f]{40}$/.test(manifest.result_commit ?? ""),
    errors,
    "manifest.result_commit must be a full commit SHA"
  );
  checkString(manifest.environment?.os, errors, "manifest.environment.os");
  checkString(
    manifest.environment?.runtime,
    errors,
    "manifest.environment.runtime"
  );
  checkAllowedKeys(
    manifest.environment,
    ["os", "runtime", "localhost_endpoints"],
    errors,
    "manifest.environment"
  );
  check(
    Array.isArray(manifest.environment?.localhost_endpoints) &&
      manifest.environment.localhost_endpoints.every((endpoint) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/.test(endpoint)
      ),
    errors,
    "manifest localhost endpoints must use localhost or 127.0.0.1"
  );
  check(
    manifest.fixture?.path === contract.core_suite.path &&
      manifest.fixture?.suite_id === suite.suite_id &&
      manifest.fixture?.version === suite.version,
    errors,
    "manifest fixture metadata does not match the frozen suite"
  );
  checkAllowedKeys(
    manifest.fixture,
    ["path", "suite_id", "version", "sha256"],
    errors,
    "manifest.fixture"
  );
  checkAllowedKeys(
    manifest.data_classification,
    ["mode", "contains_live_candidate_data", "live_external_writes"],
    errors,
    "manifest.data_classification"
  );
  check(
    manifest.data_classification?.mode === "synthetic_fixture_only" &&
      manifest.data_classification?.contains_live_candidate_data === false &&
      manifest.data_classification?.live_external_writes === false,
    errors,
    "manifest must declare synthetic-only data and no live writes"
  );

  const expectedDispositions = new Map(
    suite.cases.map((testCase) => [
      testCase.id,
      testCase.expected.disposition
    ])
  );
  const coreCaseResults = new Map();
  for (const result of manifest.core_case_results ?? []) {
    checkAllowedKeys(
      result,
      [
        "case_id",
        "status",
        "observed_disposition",
        "evidence_locators",
        "exact_gap"
      ],
      errors,
      `core_case_result.${result.case_id ?? "<missing>"}`
    );
    check(
      EXPECTED_CORE_CASES.includes(result.case_id),
      errors,
      `unknown core case result ${result.case_id}`
    );
    check(
      !coreCaseResults.has(result.case_id),
      errors,
      `duplicate core case result ${result.case_id}`
    );
    coreCaseResults.set(result.case_id, result);
    check(
      ["pass", "fail", "not_run"].includes(result.status),
      errors,
      `${result.case_id}.status is invalid`
    );
    checkStringArray(
      result.evidence_locators,
      errors,
      `${result.case_id}.evidence_locators`,
      { nonEmpty: result.status === "pass" }
    );
    if (!allowExample) {
      check(
        (result.evidence_locators ?? []).every(
          (locator) => !locator.startsWith("example://")
        ),
        errors,
        `${result.case_id}.evidence_locators must resolve to real run evidence`
      );
    }
    if (result.status === "pass") {
      if (manifest.review_object_id !== "chrome_browser_extension") {
        check(
          result.observed_disposition ===
            expectedDispositions.get(result.case_id),
          errors,
          `${result.case_id}.observed_disposition must match the frozen suite`
        );
      } else {
        check(
          result.observed_disposition === null ||
            result.observed_disposition ===
              expectedDispositions.get(result.case_id),
          errors,
          `${result.case_id}.observed_disposition is invalid for Chrome transport evidence`
        );
      }
      check(
        result.exact_gap === null,
        errors,
        `${result.case_id} pass requires a null exact_gap`
      );
    } else {
      checkString(
        result.exact_gap,
        errors,
        `${result.case_id}.exact_gap`
      );
    }
  }
  checkExactSet(
    [...coreCaseResults.keys()],
    EXPECTED_CORE_CASES,
    errors,
    "manifest core case result IDs"
  );

  const object = contract.review_objects.find(
    (candidate) => candidate.id === manifest.review_object_id
  );
  const contractCommands = new Map(
    contract.commands.map((command) => [command.id, command])
  );
  const commandResults = new Map();
  for (const result of manifest.command_results ?? []) {
    checkAllowedKeys(
      result,
      ["command_id", "command", "status", "exit_code", "output_locator"],
      errors,
      `command_result.${result.command_id ?? "<missing>"}`
    );
    checkString(result.command_id, errors, "command_result.command_id");
    check(
      !commandResults.has(result.command_id),
      errors,
      `duplicate command result ${result.command_id}`
    );
    commandResults.set(result.command_id, result);
    check(
      contractCommands.get(result.command_id)?.command === result.command,
      errors,
      `${result.command_id} command does not match the frozen contract`
    );
    check(
      ["pass", "fail", "not_run"].includes(result.status),
      errors,
      `${result.command_id}.status is invalid`
    );
    if (result.status === "pass") {
      check(
        result.exit_code === 0,
        errors,
        `${result.command_id} pass requires exit_code 0`
      );
    }
    if (result.status === "not_run") {
      check(
        result.exit_code === null,
        errors,
        `${result.command_id} not_run requires a null exit_code`
      );
    }
    checkString(
      result.output_locator,
      errors,
      `${result.command_id}.output_locator`
    );
    if (!allowExample) {
      check(
        !result.output_locator?.startsWith("example://"),
        errors,
        `${result.command_id}.output_locator must resolve to real run evidence`
      );
    }
  }
  checkExactSet(
    [...commandResults.keys()],
    object?.required_command_ids ?? [],
    errors,
    "manifest command result IDs"
  );

  for (const artifact of manifest.artifacts ?? []) {
    checkAllowedKeys(
      artifact,
      ["id", "type", "locator", "sha256"],
      errors,
      `artifact.${artifact.id ?? "<missing>"}`
    );
    checkString(artifact.id, errors, "artifact.id");
    checkString(artifact.type, errors, `${artifact.id}.type`);
    checkString(artifact.locator, errors, `${artifact.id}.locator`);
    if (!allowExample) {
      check(
        !artifact.locator?.startsWith("example://"),
        errors,
        `${artifact.id}.locator must resolve to real run evidence`
      );
    }
    check(
      /^[0-9a-f]{64}$/.test(artifact.sha256 ?? ""),
      errors,
      `${artifact.id}.sha256 must be a SHA-256 digest`
    );
  }
  for (const result of manifest.assertion_results ?? []) {
    checkAllowedKeys(
      result,
      ["assertion_id", "status", "evidence_locators", "exact_gap"],
      errors,
      `assertion_result.${result.assertion_id ?? "<missing>"}`
    );
    check(
      EXPECTED_ASSERTIONS.includes(result.assertion_id),
      errors,
      `unknown assertion result ${result.assertion_id}`
    );
    check(
      ["pass", "fail", "not_run"].includes(result.status),
      errors,
      `${result.assertion_id}.status is invalid`
    );
    checkStringArray(
      result.evidence_locators,
      errors,
      `${result.assertion_id}.evidence_locators`,
      { nonEmpty: result.status === "pass" }
    );
    if (!allowExample) {
      check(
        (result.evidence_locators ?? []).every(
          (locator) => !locator.startsWith("example://")
        ),
        errors,
        `${result.assertion_id}.evidence_locators must resolve to real run evidence`
      );
    }
    if (result.status !== "pass") {
      checkString(
        result.exact_gap,
        errors,
        `${result.assertion_id}.exact_gap`
      );
    }
  }
  checkStringArray(
    manifest.untested_behavior,
    errors,
    "manifest.untested_behavior",
    { nonEmpty: false }
  );
  return errors;
}

function validateCraftReview(review, rubric, { allowExample = true } = {}) {
  const errors = [];
  const threshold = rubric.rules.dimension_pass_threshold;
  const journeyTarget = rubric.rules.integrated_journey_target;
  checkAllowedKeys(
    review,
    [
      "review_id",
      "rubric_id",
      "artifact",
      "dimension_results",
      "integrated_journey",
      "vetoes",
      "findings",
      "verdict"
    ],
    errors,
    "craft review"
  );
  checkString(review.review_id, errors, "craft review.review_id");
  check(
    review.rubric_id === rubric.rubric_id,
    errors,
    "craft review rubric_id does not match"
  );
  check(
    !("overall_score" in review) && !("average_score" in review),
    errors,
    "craft review must not contain an overall or average score"
  );
  checkString(review.artifact?.version, errors, "craft review artifact.version");
  checkAllowedKeys(
    review.artifact,
    ["version", "review_objects", "example_only"],
    errors,
    "craft review.artifact"
  );
  checkStringArray(
    review.artifact?.review_objects,
    errors,
    "craft review artifact.review_objects"
  );
  if (!allowExample) {
    check(
      review.artifact?.example_only === false &&
        review.artifact?.version !== "EXAMPLE_ONLY",
      errors,
      "submitted craft review must set example_only=false and name the frozen artifact version"
    );
  }

  const results = new Map();
  for (const result of review.dimension_results ?? []) {
    checkAllowedKeys(
      result,
      [
        "dimension_id",
        "in_scope",
        "score",
        "evidence_level",
        "evidence_locators",
        "exact_gap",
        "not_applicable_reason"
      ],
      errors,
      `craft result.${result.dimension_id ?? "<missing>"}`
    );
    checkString(result.dimension_id, errors, "dimension_result.dimension_id");
    check(
      !results.has(result.dimension_id),
      errors,
      `duplicate craft result ${result.dimension_id}`
    );
    results.set(result.dimension_id, result);
    if (result.in_scope) {
      check(
        Number.isInteger(result.score) &&
          result.score >= 0 &&
          result.score <= 100,
        errors,
        `${result.dimension_id}.score must be an integer from 0 to 100`
      );
      check(
        result.not_applicable_reason === null,
        errors,
        `${result.dimension_id} is in scope and cannot have a not-applicable reason`
      );
      if (result.score >= threshold) {
        check(
          result.evidence_level === "direct",
          errors,
          `${result.dimension_id} score >=${threshold} requires direct evidence`
        );
        checkStringArray(
          result.evidence_locators,
          errors,
          `${result.dimension_id}.evidence_locators`
        );
        if (!allowExample) {
          check(
            result.evidence_locators.every(
              (locator) => !locator.startsWith("example://")
            ),
            errors,
            `${result.dimension_id}.evidence_locators must resolve to real direct evidence`
          );
        }
        check(
          result.exact_gap === null,
          errors,
          `${result.dimension_id} at target must have a null exact_gap`
        );
      } else {
        checkString(result.exact_gap, errors, `${result.dimension_id}.exact_gap`);
      }
    } else {
      check(
        result.score === null &&
          result.evidence_level === "not_applicable" &&
          Array.isArray(result.evidence_locators) &&
          result.evidence_locators.length === 0 &&
          result.exact_gap === null,
        errors,
        `${result.dimension_id} not-applicable fields are inconsistent`
      );
      checkString(
        result.not_applicable_reason,
        errors,
        `${result.dimension_id}.not_applicable_reason`
      );
    }
  }
  checkExactSet(
    [...results.keys()],
    EXPECTED_CRAFT_DIMENSIONS,
    errors,
    "craft result dimension IDs"
  );

  const journey = review.integrated_journey ?? {};
  checkAllowedKeys(
    journey,
    [
      "in_scope",
      "score",
      "evidence_level",
      "evidence_locators",
      "exact_gap"
    ],
    errors,
    "integrated_journey"
  );
  if (journey.in_scope) {
    check(
      Number.isInteger(journey.score) &&
        journey.score >= 0 &&
        journey.score <= 100,
      errors,
      "integrated_journey.score must be an integer from 0 to 100"
    );
    if (journey.score >= journeyTarget) {
      check(
        journey.evidence_level === "direct",
        errors,
        `integrated journey score >=${journeyTarget} requires direct evidence`
      );
      checkStringArray(
        journey.evidence_locators,
        errors,
        "integrated_journey.evidence_locators"
      );
      if (!allowExample) {
        check(
          journey.evidence_locators.every(
            (locator) => !locator.startsWith("example://")
          ),
          errors,
          "integrated_journey.evidence_locators must resolve to real direct evidence"
        );
      }
      check(
        journey.exact_gap === null,
        errors,
        "integrated journey at target must have a null exact_gap"
      );
    } else {
      checkString(
        journey.exact_gap,
        errors,
        "integrated_journey.exact_gap"
      );
    }
  } else {
    check(
      journey.score === null &&
        journey.evidence_level === "not_applicable" &&
        Array.isArray(journey.evidence_locators) &&
        journey.evidence_locators.length === 0,
      errors,
      "not-applicable integrated journey fields are inconsistent"
    );
    checkString(
      journey.exact_gap,
      errors,
      "not-applicable integrated journey requires an exact gap"
    );
  }

  checkStringArray(review.vetoes, errors, "craft review.vetoes", {
    nonEmpty: false
  });
  check(
    Array.isArray(review.findings) && review.findings.length <= 3,
    errors,
    "craft review may contain no more than three findings"
  );
  for (const [index, finding] of (review.findings ?? []).entries()) {
    checkAllowedKeys(
      finding,
      ["criterion", "gap", "evidence", "owner", "pass_condition"],
      errors,
      `findings[${index}]`
    );
    for (const field of [
      "criterion",
      "gap",
      "evidence",
      "owner",
      "pass_condition"
    ]) {
      checkString(finding[field], errors, `findings[${index}].${field}`);
    }
  }
  check(
    ["pass", "needs_correction", "fail", "abstain"].includes(review.verdict),
    errors,
    "craft review verdict is invalid"
  );
  if (review.vetoes?.length > 0) {
    check(
      review.verdict === "fail",
      errors,
      "a craft review with a veto must fail"
    );
  }
  if (review.verdict === "pass") {
    check(
      [...results.values()]
        .filter((result) => result.in_scope)
        .every(
          (result) =>
            result.score >= threshold && result.evidence_level === "direct"
        ),
      errors,
      "pass requires every in-scope craft dimension at >=98 with direct evidence"
    );
    check(
      journey.in_scope &&
        journey.score >= journeyTarget &&
        journey.evidence_level === "direct",
      errors,
      "pass requires the integrated journey at >=95 with direct evidence"
    );
    check(
      review.vetoes.length === 0,
      errors,
      "pass is unavailable with an active veto"
    );
  }
  return errors;
}

function validateAdjudicatorExamples() {
  const errors = [];
  for (const path of [paths.specialistExample, paths.panelExample]) {
    const result = spawnSync(
      "python3",
      [paths.adjudicatorValidator, path],
      {
        cwd: repositoryRoot,
        encoding: "utf8"
      }
    );
    if (result.status !== 0) {
      errors.push(
        `product-adjudicator contract rejected ${path}: ${
          result.stderr || result.stdout
        }`.trim()
      );
    }
  }
  return errors;
}

function validateJourneyValidatorSelfTest() {
  const result = spawnSync(
    process.execPath,
    [paths.journeyValidator, "--self-test"],
    {
      cwd: repositoryRoot,
      encoding: "utf8"
    }
  );
  if (result.status === 0) {
    return [];
  }
  return [
    `integrated journey validator self-test failed: ${
      result.stderr || result.stdout
    }`.trim()
  ];
}

function runNegativeCoverage({ craftExample, rubric, manifestExample, suite, contract }) {
  const errors = [];

  const lowCraftWithoutGap = clone(craftExample);
  lowCraftWithoutGap.dimension_results[0].score = 97;
  lowCraftWithoutGap.dimension_results[0].exact_gap = null;
  check(
    validateCraftReview(lowCraftWithoutGap, rubric).some((error) =>
      error.includes("exact_gap")
    ),
    errors,
    "validator coverage did not reject a below-target craft score without an exact gap"
  );

  const unsupportedHighCraft = clone(craftExample);
  unsupportedHighCraft.dimension_results[0].evidence_level =
    "supported_inference";
  check(
    validateCraftReview(unsupportedHighCraft, rubric).some((error) =>
      error.includes("direct evidence")
    ),
    errors,
    "validator coverage did not reject >=98 craft without direct evidence"
  );

  const averagedCraft = clone(craftExample);
  averagedCraft.overall_score = 98;
  check(
    validateCraftReview(averagedCraft, rubric).some((error) =>
      error.includes("overall or average")
    ),
    errors,
    "validator coverage did not reject a craft overall score"
  );

  const vetoedPass = clone(craftExample);
  vetoedPass.vetoes = ["Example active veto"];
  check(
    validateCraftReview(vetoedPass, rubric).some((error) =>
      error.includes("must fail")
    ),
    errors,
    "validator coverage did not reject pass with an active veto"
  );

  const liveManifest = clone(manifestExample);
  liveManifest.data_classification.contains_live_candidate_data = true;
  check(
    validateRunManifest(liveManifest, suite, contract).some((error) =>
      error.includes("synthetic-only")
    ),
    errors,
    "validator coverage did not reject live candidate data"
  );

  check(
    validateRunManifest(manifestExample, suite, contract, {
      allowExample: false
    }).some((error) => error.includes("must not be an example")),
    errors,
    "validator coverage did not reject an example manifest as submitted evidence"
  );

  check(
    validateCraftReview(craftExample, rubric, {
      allowExample: false
    }).some((error) => error.includes("example_only=false")),
    errors,
    "validator coverage did not reject an example craft packet as submitted evidence"
  );

  const incompleteContract = clone(contract);
  incompleteContract.cross_surface_assertions =
    incompleteContract.cross_surface_assertions.filter(
      (assertion) => assertion.id !== "XS-RECOVERY-01"
    );
  check(
    validateCrossSurfaceContract(incompleteContract, suite).some((error) =>
      error.includes("assertion IDs")
    ),
    errors,
    "validator coverage did not reject a missing recovery assertion"
  );

  return errors;
}

const [
  suite,
  contract,
  craftRubric,
  manifestSchema,
  craftSchema,
  manifestExample,
  craftExample
] = await Promise.all([
  readJson(paths.suite),
  readJson(paths.contract),
  readJson(paths.craftRubric),
  readJson(paths.manifestSchema),
  readJson(paths.craftSchema),
  readJson(paths.manifestExample),
  readJson(paths.craftExample)
]);

const suiteBytes = await readFile(paths.suite);
const suiteSha256 = createHash("sha256").update(suiteBytes).digest("hex");
const suppliedManifest = cli.manifest ? await readJson(cli.manifest) : null;
const suppliedCraftReview = cli.craftReview
  ? await readJson(cli.craftReview)
  : null;
const errors = [
  ...validateCoreSuite(suite),
  ...validateCrossSurfaceContract(contract, suite),
  ...validateCraftRubric(craftRubric),
  ...validateSchemaDocuments(manifestSchema, craftSchema),
  ...validateRunManifest(manifestExample, suite, contract),
  ...validateCraftReview(craftExample, craftRubric),
  ...validateAdjudicatorExamples(),
  ...validateJourneyValidatorSelfTest(),
  ...runNegativeCoverage({
    craftExample,
    rubric: craftRubric,
    manifestExample,
    suite,
    contract
  })
];
if (suppliedManifest) {
  errors.push(
    ...validateRunManifest(suppliedManifest, suite, contract, {
      allowExample: false
    })
  );
}
if (suppliedCraftReview) {
  errors.push(
    ...validateCraftReview(suppliedCraftReview, craftRubric, {
      allowExample: false
    })
  );
}
check(
  manifestExample.fixture.sha256 === suiteSha256,
  errors,
  "run-manifest example fixture SHA-256 does not match the frozen suite"
);

if (errors.length > 0) {
  console.error(`Overnight evaluation validation failed (${errors.length}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  [
    "Overnight evaluation validation passed:",
    `${suite.cases.length} frozen core cases`,
    `${contract.review_objects.length} review objects`,
    `${contract.cross_surface_assertions.length} cross-surface assertions`,
    `${craftRubric.dimensions.length} independent craft dimensions`,
    "2 JSON schemas",
    "4 contract examples",
    suppliedManifest ? "1 supplied manifest" : null,
    suppliedCraftReview ? "1 supplied craft review" : null
  ]
    .filter(Boolean)
    .join(" ")
);
