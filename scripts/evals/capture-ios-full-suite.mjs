import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const resultPath =
  process.env.IOS_XCRESULT_PATH ?? "/tmp/talent-signal-full-final.xcresult";
const logPath =
  process.env.IOS_CHECK_LOG_PATH ?? "/tmp/talent-signal-full-final.log";
const outputPath = path.join(
  repositoryRoot,
  process.env.IOS_FULL_SUITE_OUTPUT_PATH ??
    "docs/evaluations/2026-08-24-v1-prd-08/ios-full-suite-runtime.json",
);

const result = JSON.parse(
  execFileSync(
    "xcrun",
    ["xcresulttool", "get", "test-results", "tests", "--path", resultPath],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);
const testCases = [];
function collect(node) {
  if (node.nodeType === "Test Case") testCases.push(node);
  for (const child of node.children ?? []) collect(child);
}
for (const node of result.testNodes ?? []) collect(node);
assert(testCases.length > 0, "The xcresult contains no test cases.");
const failed = testCases.filter((test) => test.result === "Failed");
const skipped = testCases.filter((test) => test.result === "Skipped");
assert.deepEqual(
  failed.map((test) => test.nodeIdentifier),
  [],
  "The full iOS suite has failing tests.",
);
assert.deepEqual(
  skipped.map((test) => test.nodeIdentifier),
  ["CandidateSignalUITests/testLocalhostSyncSuccess()"],
  "Only the legacy opt-in localhost fixture journey may be skipped.",
);
const passedIdentifiers = new Set(
  testCases
    .filter((test) => test.result === "Passed")
    .map((test) => test.nodeIdentifier),
);
const required = {
  pending_inbox_restores_reviewed_draft:
    "RelationshipCaptureTests/testPendingInboxRestoresReviewedDraft()",
  background_interruption_preserves_review_decision:
    "CandidateSignalUITests/testBackgroundInterruptionPreservesReviewDecision()",
  canonical_person_identity_rows_distinct:
    "CandidateSignalUITests/testCanonicalPersonDetailKeepsGovernedIdentityRowsDistinct()",
  typed_signal_relaunch_stages_canonical_proposal:
    "CandidateSignalUITests/testTypedSignalPersistsAcrossRelaunchThenStagesCanonicalProposal()",
  typed_signal_offline_retry_and_deletion:
    "CandidateSignalUITests/testTypedSignalOfflineRelaunchRetriesThenDeletesGovernedEvidence()",
  same_name_text_signal_identity_readback:
    "CandidateSignalUITests/testSameNameTextSignalScopeStaysDistinctAcrossRelaunchAndReadback()",
  canonical_review_and_action_outcome:
    "CandidateSignalUITests/testCanonicalWorkspaceAX5DarkReducedMotionKeepsNavigationReachable()",
  ask_opens_exact_existing_pursuit_action:
    "CandidateSignalUITests/testCanonicalAskSearchesWorkspaceAndReturnsEvidenceBoundResponse()",
  audio_authorization_receipt_lifecycle:
    "CandidateSignalUITests/testAudioSignalRequiresAuthorizationThenShowsVerifiedLocalLifecycle()",
  receipt_operation_binding:
    "PursuitProposalReviewStoreTests/testMismatchedReceiptOperationNeverPresentsAppliedSuccess()",
  response_loss_reconciles_without_resubmit:
    "CandidateSignalUITests/testResponseLossRelaunchReconcilesPersistedOperationWithoutResubmit()",
  owned_action_response_loss_reconciles_without_second_post:
    "CandidateSignalUITests/testOwnedActionResponseLossRelaunchReconcilesWithoutSecondPost()",
  restored_evidence_review_requires_current_authority_readback:
    "RelationshipArchiveTests/testSupersededPersistenceFailureKeepsSessionTerminalGuard()",
  release_arguments_are_inert:
    "ReleaseBoundaryTests/testSyntheticLaunchArgumentsAreInertOutsideDebugBuilds()",
};
const checks = Object.fromEntries(
  Object.entries(required).map(([name, identifier]) => [
    name,
    passedIdentifiers.has(identifier),
  ]),
);
assert.equal(
  Object.values(checks).every(Boolean),
  true,
  "The full iOS suite is missing a required P0 test.",
);
const log = await readFile(logPath, "utf8");
assert(log.includes("** BUILD SUCCEEDED **"), "The Release build did not pass.");
assert(
  log.includes("** TEST BUILD SUCCEEDED **"),
  "The full-suite test build did not pass.",
);
assert.equal(
  (log.match(/\*\* TEST EXECUTE SUCCEEDED \*\*/g) ?? []).length,
  40,
  "Every isolated unit/UI result part must finish successfully.",
);
assert(!log.includes("Failing tests:"), "The log still names failing tests.");
const infrastructureRetryCount = (
  log.match(/Retrying isolated iOS test after runner bootstrap failure:/g) ?? []
).length;

const artifact = {
  artifact_version: "talent-signal.v1-ios-full-suite.1",
  contract_version: "2026-08-24.10",
  generated_at: new Date().toISOString(),
  data_classification: "synthetic_only",
  verdict: "pass",
  environment: result.devices?.[0] ?? null,
  release_build: "passed",
  test_count: testCases.length,
  passed_test_count: testCases.filter((test) => test.result === "Passed").length,
  failed_test_count: failed.length,
  skipped_test_count: skipped.length,
  allowed_skip: skipped[0]?.nodeIdentifier ?? null,
  infrastructure_retry_count: infrastructureRetryCount,
  checks,
};
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(
  `iOS full-suite artifact passed ${artifact.passed_test_count}/${artifact.test_count} ` +
    `with ${artifact.skipped_test_count} documented opt-in skip.`,
);
