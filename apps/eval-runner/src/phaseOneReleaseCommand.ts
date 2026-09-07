import { sign, verify } from "node:crypto";
import { renderRelationshipTaskSelectionModule } from "@talent-signal/agent";
import {
  decidePhaseOneRelease, digestCanonicalJson, phaseOneAssert, phaseOneExposureDigest, phaseOneId, phaseOneTime,
  readPhaseOneRuntime, signPhaseOneReleaseDecision, signPhaseOneRollbackProof, signPhaseOneRuntimeReadback,
  verifyPhaseOneDeploymentReadback, verifyPhaseOneReleaseDecision, verifyPhaseOneRollbackProof,
  verifyPhaseOneRollbackReadback, verifyPhaseOneRuntimeReadback,
  type PhaseOneExposure, type PhaseOneReleaseAuthorization, type PhaseOneReleaseBinding, type PhaseOneReleaseDecisionEnvelope,
  type PhaseOneRollbackEnvelope, type PhaseOneRuntimeEnvelope, type PhaseOneTrustedVerifier, type PhaseOneVerificationEnvelope,
} from "@talent-signal/evaluation";
import { createPhaseOneHttpRuntimeReader, phaseOneJudgmentContext, type FrozenStudy, type PhaseOneController } from "./phaseOneCommand.js";
import { eligiblePhaseOneJudgeAssurance } from "./phaseOneJudge.js";
import { assertOptimizationControllerBinding, readOptimizationBudgetController } from "./optimization/controller.js";
import { validateOptimizationCandidate, type OptimizationDevExample } from "./optimization/productTask.js";
import { readPhaseOneControllerDataset } from "./phaseOneDatasetLifecycle.js";

interface ReleaseController {
  schemaVersion: "phase-one-release-controller.v1";
  executorId: string;
  keyId: string;
  privateKeyFile: string;
  publicKeyFile: string;
  bindingFile: string;
  authorizationFile: string;
  rehearsalAuthorizationFile: string;
  environments: Record<string, { origin: string; deploymentId: string }>;
}
interface RehearsalAuthorization {
  authorizationId: string;
  allowedAction: "rehearse_rollback";
  bindingDigest: string;
  environmentId: string;
  humanDelegatorId: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
interface Context {
  directory: string;
  config: PhaseOneController;
  frozen: FrozenStudy;
  verificationKeys: { signer: { keyId: string; executorId: string; privateKeyPem: string }; trusted: PhaseOneTrustedVerifier[] };
  readJson(name: string): unknown;
  readText(name: string): string;
  write(name: string, value: unknown): void;
  validateSources(): Promise<void>;
}

/** Commands observe and adjudicate actual deployment state. They do not run deployment scripts. */
export async function runPhaseOneReleaseCommand(command: string, context: Context): Promise<unknown> {
  const settings = context.readJson("phase-one-release-controller.json") as ReleaseController;
  phaseOneAssert(settings.schemaVersion === "phase-one-release-controller.v1", "PHASE_ONE_RELEASE_CONTROLLER_INVALID");
  phaseOneId(settings.executorId); phaseOneId(settings.keyId);
  phaseOneAssert(settings.executorId !== context.config.executorId && settings.executorId !== context.config.generatorActorId
    && !context.config.reviewers.includes(settings.executorId)
    && !context.frozen.comparison.criteria.some(item => item.evaluatorId === settings.executorId)
    && settings.keyId !== context.config.keyId, "PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  const privateKeyPem = context.readText(settings.privateKeyFile), publicKeyPem = context.readText(settings.publicKeyFile);
  phaseOneAssert(publicKeyPem !== context.verificationKeys.trusted[0]?.publicKeyPem
    && verify(null, Buffer.from("release-key-pair"), publicKeyPem, sign(null, Buffer.from("release-key-pair"), privateKeyPem)), "PHASE_ONE_RELEASE_KEY_NOT_INDEPENDENT");
  const signer = { keyId: settings.keyId, executorId: settings.executorId, privateKeyPem };
  const trusted = [{ keyId: settings.keyId, executorId: settings.executorId, publicKeyPem }];
  const binding = context.readJson(settings.bindingFile) as PhaseOneReleaseBinding;
  const now = new Date().toISOString();
  phaseOneAssert(binding.targetEnvironmentId !== binding.rollbackEnvironmentId && settings.environments[binding.targetEnvironmentId]
    && settings.environments[binding.rollbackEnvironmentId], "PHASE_ONE_REHEARSAL_MUST_BE_ISOLATED");
  // Distinct labels pointing at one actual deployment do not count as isolated rehearsal.
  phaseOneAssert(settings.environments[binding.targetEnvironmentId]!.origin !== settings.environments[binding.rollbackEnvironmentId]!.origin
    && settings.environments[binding.targetEnvironmentId]!.deploymentId !== settings.environments[binding.rollbackEnvironmentId]!.deploymentId,
    "PHASE_ONE_REHEARSAL_MUST_BE_ISOLATED");
  const authority = {
    async readAuthorization(id: string) {
      const value = context.readJson(settings.authorizationFile) as PhaseOneReleaseAuthorization;
      return value.authorizationId === id ? value : null;
    },
    async readExposureDigest() { return phaseOneExposureDigest(readPhaseOneControllerDataset(context.config, context.readJson).exposures); },
    async readJudgmentContextDigest() {
      const current = phaseOneJudgmentContext(context.config, context.readJson);
      if (context.config.semanticEvaluation.kind === "model") phaseOneAssert(eligiblePhaseOneJudgeAssurance(current.assurance,
        context.config.semanticEvaluation, context.frozen.comparison.rubricDigest), "PHASE_ONE_JUDGE_ASSURANCE_INCOMPLETE");
      return current.digest;
    },
  };
  const runtime = createPhaseOneHttpRuntimeReader({ environments: settings.environments,
    bearerToken: process.env.TALENT_SIGNAL_PHASE_ONE_RUNTIME_TOKEN ?? "" });
  const verification = context.readJson("phase-one-verification.json") as PhaseOneVerificationEnvelope;
  const authorization = context.readJson(settings.authorizationFile) as PhaseOneReleaseAuthorization;
  phaseOneAssert(authorization.reviewer.actorId === settings.executorId, "PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  const assertLocalAuthority = (judgmentDigest: string) => {
    phaseOneAssert(digestCanonicalJson(context.readJson(settings.authorizationFile)) === digestCanonicalJson(authorization)
      && authorization.revokedAt === null && phaseOneTime(authorization.expiresAt) > Date.now(), "PHASE_ONE_AUTHORIZATION_STALE");
    phaseOneAssert(phaseOneJudgmentContext(context.config, context.readJson).digest === judgmentDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    phaseOneAssert(phaseOneExposureDigest(readPhaseOneControllerDataset(context.config, context.readJson).exposures) === binding.exposureDigest, "PHASE_ONE_EXPOSURE_CHANGED");
  };
  if (command.startsWith("rollback-")) {
    const grant = context.readJson(settings.rehearsalAuthorizationFile) as RehearsalAuthorization;
    phaseOneId(grant.authorizationId); phaseOneId(grant.humanDelegatorId);
    phaseOneAssert(grant.allowedAction === "rehearse_rollback" && grant.bindingDigest === digestCanonicalJson(binding)
      && grant.environmentId === binding.rollbackEnvironmentId && grant.revokedAt === null
      && phaseOneTime(grant.grantedAt) <= Date.now() && phaseOneTime(grant.expiresAt) > Date.now(), "PHASE_ONE_REHEARSAL_AUTHORIZATION_REQUIRED");
    const stage = command.slice("rollback-".length) as "baseline" | "candidate" | "restored";
    const readback = await readPhaseOneRuntime(binding.rollbackEnvironmentId, runtime);
    await context.validateSources();
    phaseOneAssert(digestCanonicalJson(context.readJson(settings.rehearsalAuthorizationFile)) === digestCanonicalJson(grant)
      && phaseOneTime(grant.expiresAt) > Date.now(), "PHASE_ONE_REHEARSAL_AUTHORIZATION_REQUIRED");
    phaseOneAssert(readback.runtimeDigest === (stage === "candidate" ? binding.candidateRuntimeDigest : binding.baselineRuntimeDigest)
      && readback.taskConfigurationDigest === (stage === "candidate" ? binding.candidateDigest : binding.baselineDigest), "PHASE_ONE_ROLLBACK_TASK_CONFIGURATION_MISMATCH");
    // Each step is captured from the running authenticated surface and independently signed.
    const envelope = signPhaseOneRuntimeReadback(readback, signer);
    if (stage !== "baseline") {
      const baseline = verifyPhaseOneRuntimeReadback(context.readJson("phase-one-rollback-baseline.json") as PhaseOneRuntimeEnvelope, trusted);
      phaseOneAssert(baseline.targetEnvironmentId === binding.rollbackEnvironmentId && baseline.runtimeDigest === binding.baselineRuntimeDigest
        && baseline.taskConfigurationDigest === binding.baselineDigest, "PHASE_ONE_ROLLBACK_BINDING_STALE");
      if (stage === "candidate") phaseOneAssert(phaseOneTime(baseline.observedAt) < phaseOneTime(readback.observedAt)
        && baseline.processInstanceId !== readback.processInstanceId, "PHASE_ONE_ROLLBACK_PROCESS_NOT_RELOADED");
      else {
        const candidate = verifyPhaseOneRuntimeReadback(context.readJson("phase-one-rollback-candidate.json") as PhaseOneRuntimeEnvelope, trusted);
        const proof = verifyPhaseOneRollbackReadback({ binding, baseline, candidate, restored: readback });
        context.write("phase-one-rollback-proof.json", signPhaseOneRollbackProof(proof, signer));
      }
    }
    context.write(`phase-one-rollback-${stage}.json`, envelope);
    return { status: `rollback_${stage}_observed`, readbackDigest: readback.contentDigest, environmentId: binding.rollbackEnvironmentId, releaseAuthority: "none" };
  }
  if (command === "release-review") {
    phaseOneAssert(context.config.providerKind === "real_model", "PHASE_ONE_REAL_VERIFICATION_REQUIRED");
    phaseOneAssert(context.frozen.buildEvidence && context.frozen.buildEvidence.runtimeBuildDigest === binding.candidateBuildDigest
      && context.frozen.buildEvidence.applicationRevision === binding.candidateApplicationRevision, "PHASE_ONE_CI_BUILD_BINDING_MISMATCH");
    phaseOneAssert(context.config.environmentDigest === digestCanonicalJson({ targetEnvironmentId: binding.targetEnvironmentId,
      rollbackEnvironmentId: binding.rollbackEnvironmentId, environments: settings.environments, deploymentExposureDigest: binding.deploymentExposureDigest }), "PHASE_ONE_DEPLOYMENT_SCOPE_BINDING_MISMATCH");
    const budget = readOptimizationBudgetController(context.directory, context.config.runId);
    try {
      assertOptimizationControllerBinding(context.directory, budget.configuration, budget.run);
      const summary = budget.ledger.summarize(context.config.runId);
      phaseOneAssert(summary.status !== "tombstoned" && summary.status !== "unconfigured" && summary.activeCalls === 0
        && summary.unknown.calls === 0 && summary.spent.calls > 0, "PHASE_ONE_BUDGET_ACCOUNTING_INCOMPLETE");
    } finally { budget.ledger.close(); }
    const examples = context.readJson(context.config.examplesFile) as OptimizationDevExample[];
    const candidate = validateOptimizationCandidate(context.frozen.comparison.candidate.parameters, examples);
    // Global builds may include synthetic demonstrations only. Private business evidence remains purpose-scoped to evaluation.
    const sourceModule = renderRelationshipTaskSelectionModule(candidate, examples);
    const rollback = verifyPhaseOneRollbackProof(context.readJson("phase-one-rollback-proof.json") as PhaseOneRollbackEnvelope, trusted);
    const decision = await decidePhaseOneRelease({ comparison: context.frozen.comparison, dataset: context.frozen.dataset,
      verification, trustedVerifiers: context.verificationKeys.trusted, binding, rollback, authorizationId: authorization.authorizationId, now, authority, runtime });
    await context.validateSources();
    assertLocalAuthority(decision.judgmentContextDigest);
    context.write("phase-one-release-decision.json", signPhaseOneReleaseDecision(decision, signer));
    context.write("phase-one-release-proposal.json", { schemaVersion: "phase-one-release-proposal.v1", decisionDigest: decision.contentDigest,
      candidateDigest: binding.candidateDigest, sourcePath: "apps/agent/src/prompts/relationship-task-selection.ts", sourceModule,
      applyStatus: "not_run", targetEnvironmentId: binding.targetEnvironmentId, expiresAt: decision.expiresAt });
    return { status: decision.status, decisionDigest: decision.contentDigest, deploymentStatus: "not_run", releaseAuthority: "exact_scoped_authorization" };
  }
  const decision = verifyPhaseOneReleaseDecision(context.readJson("phase-one-release-decision.json") as PhaseOneReleaseDecisionEnvelope, trusted);
  phaseOneAssert(decision.binding.comparisonDigest === context.frozen.comparison.contentDigest
    && digestCanonicalJson(decision.binding) === digestCanonicalJson(binding), "PHASE_ONE_RELEASE_BINDING_STALE");
  if (command === "release-inspect") {
    phaseOneAssert(authorization.revokedAt === null && authorization.bindingDigest === digestCanonicalJson(binding)
      && phaseOneTime(authorization.expiresAt) > Date.now() && await authority.readExposureDigest() === binding.exposureDigest, "PHASE_ONE_AUTHORIZATION_STALE");
    phaseOneAssert(await authority.readJudgmentContextDigest() === decision.judgmentContextDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    return { status: "authenticated_exact_decision", decisionDigest: decision.contentDigest, deploymentStatus: "not_checked", expiresAt: decision.expiresAt };
  }
  phaseOneAssert(command === "release-readback", "PHASE_ONE_COMMAND_INVALID");
  const receipt = await verifyPhaseOneDeploymentReadback({ decision, datasetId: context.frozen.dataset.datasetId, now, authority, runtime });
  await context.validateSources();
  assertLocalAuthority(decision.judgmentContextDigest);
  context.write("phase-one-deployment-receipt.json", receipt);
  return { status: receipt.status, decisionDigest: decision.contentDigest, runtimeDigest: receipt.readback.runtimeDigest,
    taskConfigurationDigest: receipt.readback.taskConfigurationDigest };
}
