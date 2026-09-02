import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const proofPath = resolve(
  repositoryRoot,
  "docs/evaluations/2026-09-01-evaluation-platform/opik-integration-proof.json",
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function repositoryPath(path) {
  return resolve(repositoryRoot, path);
}

async function readLedgerEvents(directory) {
  const names = (await readdir(directory)).filter((name) => /^\d{4}-.*\.json$/.test(name));
  return Promise.all(names.map((name) => readJson(resolve(directory, name))));
}

const proof = await readJson(proofPath);
assert.equal(proof.schemaVersion, "talent-signal-opik-integration-proof.v2");
assert.equal(proof.scope.dataClass, "synthetic_shareable");
assert.equal(proof.scope.ownerControlledInstance, true);
assert.ok(proof.scope.excludedClaims.some((claim) => claim.includes("not recruiter workflow approval")));

const runnerPackage = await readJson(resolve(repositoryRoot, "apps/eval-runner/package.json"));
assert.equal(runnerPackage.dependencies.opik, proof.runtime.opikSdk);
assert.equal(proof.runtime.opikSdk, proof.runtime.opikServer);
assert.match(proof.runtime.opikServerImageDigest, /^sha256:[a-f0-9]{64}$/);

assert.equal(proof.dataset.itemCount, 12);
assert.equal(proof.dataset.firstOperation, "create");
assert.equal(proof.dataset.retryOperation, "noop");
assert.equal(proof.dataset.idempotencyVerified, true);
assert.match(proof.dataset.datasetDigest, /^sha256:[a-f0-9]{64}$/);

const experiments = proof.agentDefinitionExperiments;
assert.equal(experiments.length, 2);
assert.deepEqual(
  experiments.map((item) => item.agentDefinitionVersion).sort(),
  ["1.0.0", "2.0.0"],
);
assert.equal(new Set(experiments.map((item) => item.agentDefinitionDigest)).size, 2);
assert.equal(new Set(experiments.map((item) => item.experimentId)).size, 2);
assert.equal(new Set(experiments.map((item) => item.externalTraceId)).size, 2);
assert.deepEqual(
  new Set(experiments.map((item) => item.remoteDatasetVersionId)),
  new Set([proof.dataset.datasetVersionId]),
);

for (const [index, experiment] of experiments.entries()) {
  assert.equal(experiment.localGateStatus, "needs_review");
  assert.equal(experiment.deterministicSafetyStatus, "pass");
  assert.equal(experiment.projectionStatus, "succeeded");
  assert.equal(experiment.projectionReasonCode, "PROJECTION_COMPLETE");
  assert.equal(experiment.trialNumber, 3);
  assert.ok(experiment.experimentName.includes(experiment.agentDefinitionDigest.slice(7, 19)));
  assert.ok(experiment.experimentName.includes(experiment.profileDigest.slice(7, 19)));
  assert.ok(experiment.experimentName.endsWith(`trial-${experiment.trialNumber}`));

  const completionPath = repositoryPath(index === 0 ? proof.evidence.v1Completion : proof.evidence.v2Completion);
  const completion = await readJson(completionPath);
  assert.equal(completion.runId, experiment.runId);
  assert.equal(completion.artifactDigest, experiment.localArtifactDigest);
  assert.equal(completion.gateDigest, experiment.localGateDigest);

  const artifact = await readJson(
    resolve(dirname(completionPath), `run-artifact.${experiment.localArtifactDigest.slice(7)}.json`),
  );
  assert.equal(artifact.manifest.runId, experiment.runId);
  assert.equal(artifact.manifest.contentDigest, experiment.manifestDigest);
  assert.equal(artifact.manifest.attempt.attemptId, experiment.attemptId);
  assert.equal(artifact.manifest.attempt.agentDefinition.contentDigest, experiment.agentDefinitionDigest);
  assert.equal(artifact.manifest.attempt.trialNumber, experiment.trialNumber);
  assert.equal(
    artifact.manifest.attempt.fingerprints.sdk.contentDigest,
    experiment.evaluationRuntimeDigest,
  );
  assert.equal(artifact.manifest.attempt.fingerprints.sdk.identityId, "evaluation-runtime");
  assert.equal(artifact.gate.status, "needs_review");
  const workflowCapability = artifact.gate.capabilities.find(
    (capability) => capability.capability === "workflow",
  );
  assert.deepEqual(workflowCapability?.missingEvaluatorIds, ["human-workflow"]);
  assert.equal(workflowCapability?.status, "needs_review");
  assert.ok(
    artifact.gate.capabilities
      .filter((capability) => capability.capability !== "workflow")
      .every(
        (capability) => capability.status === "pass" && capability.missingEvaluatorIds.length === 0,
      ),
  );
  assert.ok(artifact.gate.scores.every((score) => score.evaluatorId === "deterministic-safety" && score.status === "pass"));

  const ledgerDirectory = repositoryPath(index === 0 ? proof.evidence.v1Ledger : proof.evidence.v2Ledger);
  const events = await readLedgerEvents(ledgerDirectory);
  const completionEvent = events.find((event) => event.contentDigest === experiment.ledgerCompletionDigest);
  assert.ok(completionEvent, `Missing completion ledger event ${experiment.ledgerCompletionDigest}`);
  assert.equal(completionEvent.status, "succeeded");
  assert.equal(completionEvent.reasonCode, "PROJECTION_COMPLETE");
  assert.equal(completionEvent.localArtifactDigest, experiment.localArtifactDigest);
  assert.equal(completionEvent.externalId, experiment.externalTraceId);
  assert.equal(completionEvent.experimentId, experiment.experimentId);
  assert.equal(completionEvent.experimentItemId, experiment.experimentItemId);
  assert.equal(completionEvent.remoteDatasetVersionId, proof.dataset.datasetVersionId);
}

assert.deepEqual(proof.comparisonAssertions, {
  sameDatasetId: true,
  sameDatasetVersionId: true,
  sameDatasetDigest: true,
  differentAgentDefinitionVersions: true,
  differentAgentDefinitionDigests: true,
  digestBoundExperimentIdentity: true,
  trialBoundExperimentIdentity: true,
  differentExperimentIds: true,
  differentExternalTraceIds: true,
});
assert.deepEqual(proof.retryIdempotency, {
  runIdStable: true,
  manifestDigestStable: true,
  localArtifactDigestStable: true,
  idempotencyKeyStable: true,
  contentAddressedSpanIds: true,
  remoteUniqueSpanCountBeforeRetry: 13,
  remoteUniqueSpanCountAfterRetry: 13,
  duplicateLogicalSpanGrowth: 0,
  physicalUpsertRowsAfterRetry: 26,
  physicalStorageSemantics: "ReplacingMergeTree upserts collapse by content-addressed span ID",
  feedbackScoreCountAfterRetry: 10,
});

for (const key of [
  "candidateConversationExported",
  "screenshotOrAttachmentExported",
  "oracleExported",
  "rawToolPayloadExported",
]) {
  assert.equal(proof.safeProjectionAssertions[key], false);
}
for (const key of [
  "projectedFieldsAreAllowlisted",
  "unknownRuntimeEnumsRejectedBeforeTransport",
  "freeTextIdentifiersAndPathsRejectedBeforeTransport",
  "scoresAreAtomicNotAggregate",
  "scoreAuthorityVetoAndEvidencePreserved",
]) {
  assert.equal(proof.safeProjectionAssertions[key], true);
}

assert.deepEqual(proof.releaseSemantics, {
  p0ScenarioCount: 12,
  deterministicSafetyPassCount: 12,
  deterministicSafetyFailCount: 0,
  releaseReadinessPassCount: 0,
  releaseReadinessNeedsReviewCount: 12,
  reasonCode: "HUMAN_WORKFLOW_EVIDENCE_REQUIRED",
});

const deletedExperiment = experiments.find((item) => item.agentDefinitionVersion === "2.0.0");
assert.ok(deletedExperiment);
assert.equal(proof.deletion.projectionId, `opik:${deletedExperiment.runId}`);
assert.equal(proof.deletion.externalTraceId, deletedExperiment.externalTraceId);
assert.equal(proof.deletion.experimentId, deletedExperiment.experimentId);
assert.equal(proof.deletion.experimentItemId, deletedExperiment.experimentItemId);
const deletion = await readJson(repositoryPath(proof.evidence.deletionReceipt));
assert.equal(deletion.contentDigest, proof.deletion.receiptDigest);
assert.equal(deletion.projectionId, proof.deletion.projectionId);
assert.equal(deletion.status, "deleted");
assert.equal(deletion.readBackVerified, true);
assert.equal(deletion.deletionScope, "trace_projection");
assert.deepEqual(deletion.retainedSurfaces, proof.deletion.retainedSurfaces);
assert.equal(deletion.reasonCode, "OPIK_TRACE_AND_EXPERIMENT_LINK_DELETE_VERIFIED");
assert.equal(proof.deletion.traceExistsAfterDeletion, false);
assert.equal(proof.deletion.experimentLinkExistsAfterDeletion, false);

const postDeletionEvents = await readLedgerEvents(
  repositoryPath(proof.evidence.postDeletionReplayLedger),
);
const postDeletionFailures = postDeletionEvents.filter((event) => event.status === "failed");
assert.ok(postDeletionFailures.length >= 2);
assert.ok(
  postDeletionFailures.every(
    (event) => event.reasonCode === proof.postDeletionReplay.sameDeletedProjectionFailureReasonCode,
  ),
);
assert.equal(proof.postDeletionReplay.deletedTrialNumber, 1);
assert.equal(proof.postDeletionReplay.sameDeletedProjectionRejected, true);
assert.equal(proof.postDeletionReplay.localAuthorityRemainedReadable, true);
assert.equal(proof.postDeletionReplay.newTrialNumber, 3);
assert.equal(proof.postDeletionReplay.newTrialExperimentSucceeded, true);

const recoveryEvents = await readLedgerEvents(repositoryPath(proof.evidence.failureRecoveryLedger));
const failed = recoveryEvents.find((event) => event.contentDigest === proof.failureRecovery.failedLedgerEventDigest);
const recovered = recoveryEvents.find((event) => event.contentDigest === proof.failureRecovery.laterCompletionLedgerEventDigest);
assert.equal(failed?.status, "failed");
assert.equal(failed?.reasonCode, proof.failureRecovery.failureReasonCode);
assert.equal(recovered?.status, "succeeded");
assert.equal(recovered?.reasonCode, "PROJECTION_COMPLETE");
assert.equal(failed?.localArtifactDigest, proof.failureRecovery.localArtifactDigest);
assert.equal(recovered?.localArtifactDigest, proof.failureRecovery.localArtifactDigest);
assert.equal(proof.failureRecovery.localAuthoritySurvivedProjectionFailure, true);
assert.equal(proof.failureRecovery.laterProjectionSucceededWithoutRewritingLocalGate, true);

assert.equal(proof.cleanup.remoteV2TraceAndExperimentLinkDeleted, true);
assert.equal(proof.cleanup.remoteDatasetAndExperimentRetainedByScopedDeletion, true);
assert.equal(proof.cleanup.candidateDataPresent, false);
assert.equal(proof.cleanup.taskOwnedLocalOpikStack, "completed");
assert.equal(proof.cleanup.taskOwnedContainersRemaining, 0);
assert.equal(proof.cleanup.taskOwnedVolumesRemaining, 0);
assert.equal(proof.cleanup.taskOwnedNetworksRemaining, 0);
assert.equal(proof.cleanup.temporaryCloneMovedToTrash, true);

process.stdout.write(
  `${JSON.stringify({
    status: "pass",
    proofPath: proofPath.slice(repositoryRoot.length + 1),
    datasetVersionId: proof.dataset.datasetVersionId,
    experimentCount: experiments.length,
    retryDuplicateLogicalSpanGrowth: proof.retryIdempotency.duplicateLogicalSpanGrowth,
    deletionReadBackVerified: deletion.readBackVerified,
    releaseReadiness: "needs_review",
  })}\n`,
);
