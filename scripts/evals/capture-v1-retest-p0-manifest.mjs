import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const templatePath = path.join(
  repositoryRoot,
  process.env.V1_P0_TEMPLATE_PATH ??
    "docs/evaluations/2026-08-24-v1-prd-08/p0-journey-manifest.json",
);
const outputPath = path.join(
  repositoryRoot,
  process.env.V1_P0_MANIFEST_PATH ??
    "docs/evaluations/2026-08-24-v1-final-panel-retest-03/evidence/p0-journey-manifest.json",
);
const evidenceRoot =
  process.env.V1_RETEST_EVIDENCE_ROOT ??
  "docs/evaluations/2026-08-24-v1-final-panel-retest-03/evidence";

const manifest = JSON.parse(await readFile(templatePath, "utf8"));
assert.equal(manifest.journey_count, 12);
manifest.contract_version = "2026-08-24.10";

const sourceReplacements = new Map([
  [
    "docs/evaluations/2026-08-24-v1-prd-01/pursuit-domain-runtime.json",
    `${evidenceRoot}/pursuit-domain/pursuit-domain-runtime.json`,
  ],
  [
    "docs/evaluations/2026-08-24-v1-prd-03/agent-control-plane-deterministic-runtime.json",
    `${evidenceRoot}/agent-control-plane/agent-control-plane-deterministic-runtime.json`,
  ],
  [
    "docs/evaluations/2026-08-24-v1-prd-03/claude-agent-live-runtime.json",
    `${evidenceRoot}/agent-control-plane/claude-agent-live-runtime.json`,
  ],
  [
    "docs/evaluations/2026-08-24-v1-prd-04/pursuit-proposal-runtime.json",
    `${evidenceRoot}/pursuit-proposal/pursuit-proposal-runtime.json`,
  ],
  [
    "docs/evaluations/2026-08-24-v1-prd-07/pursuit-evidence-integrity-runtime.json",
    `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
  ],
  [
    "docs/evaluations/2026-08-24-v1-prd-08/ios-full-suite-runtime.json",
    `${evidenceRoot}/ios-full-suite-runtime.json`,
  ],
]);
for (const journey of manifest.journeys) {
  journey.assertions = journey.assertions.map((expectation) => ({
    ...expectation,
    source: sourceReplacements.get(expectation.source) ?? expectation.source,
  }));
}

function appendAssertion(journeyID, pathName, expectedValue) {
  const journey = manifest.journeys.find(({ id }) => id === journeyID);
  assert(journey, `Missing ${journeyID}`);
  journey.assertions.push({
    source: `${evidenceRoot}/ios-full-suite-runtime.json`,
    path: pathName,
    equals: expectedValue,
  });
}

appendAssertion("P0-01", "checks.typed_signal_relaunch_stages_canonical_proposal", true);
appendAssertion("P0-01", "checks.receipt_operation_binding", true);
appendAssertion("P0-02", "checks.response_loss_reconciles_without_resubmit", true);
appendAssertion("P0-04", "checks.same_name_text_signal_identity_readback", true);
appendAssertion("P0-06", "checks.canonical_review_and_action_outcome", true);
appendAssertion("P0-08", "checks.pending_inbox_restores_reviewed_draft", true);
appendAssertion("P0-08", "checks.background_interruption_preserves_review_decision", true);
appendAssertion("P0-09", "checks.audio_authorization_receipt_lifecycle", true);

const deletion = manifest.journeys.find(({ id }) => id === "P0-03");
deletion.assertions.push(
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.applied_milestone_value_preserved_after_source_delete",
    equals: true,
  },
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.applied_milestone_authority_unavailable_after_source_delete",
    equals: true,
  },
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.applied_milestone_keeps_confirmer_time_proposal_and_receipt",
    equals: true,
  },
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.source_derived_proposal_content_redacted_after_deletion",
    equals: true,
  },
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.deletion_canary_absent_from_api_and_operational_stores",
    equals: true,
  },
  {
    source: `${evidenceRoot}/pursuit-evidence/pursuit-evidence-integrity-runtime.json`,
    path: "checks.milestone_authority_follows_latest_mutation_not_value_equality",
    equals: true,
  },
);

const action = manifest.journeys.find(({ id }) => id === "P0-07");
action.canonical_final_state =
  "The action has one workspace owner, remains internal, and closes only through an owner-authored observed outcome with revisioned canonical readback.";
action.receipt_or_recovery =
  "Canonical completion uses one persisted client operation ID; response loss locks and relaunch readback recovers one Receipt without a second POST.";
action.assertions.push(
  {
    source: `${evidenceRoot}/pursuit-domain/pursuit-domain-runtime.json`,
    path: "results.owned_action_observed_outcome",
    equals: "persisted_with_revisioned_readback",
  },
  {
    source: `${evidenceRoot}/pursuit-domain/pursuit-domain-runtime.json`,
    path: "results.duplicate_action_completion_same_receipt",
    equals: "pass",
  },
  {
    source: `${evidenceRoot}/pursuit-domain/pursuit-domain-runtime.json`,
    path: "results.reused_action_operation_id",
    equals: "rejected",
  },
  {
    source: `${evidenceRoot}/ios-full-suite-runtime.json`,
    path: "checks.owned_action_response_loss_reconciles_without_second_post",
    equals: true,
  },
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Retest P0 manifest frozen at ${path.relative(repositoryRoot, outputPath)}.`);
