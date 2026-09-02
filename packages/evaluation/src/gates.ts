import type {
  CapabilityGateV1,
  EvaluationAttemptV1,
  EvaluationGateResultV1,
  EvaluationGateStatus,
  EvaluationScenarioDocumentV1,
  EvaluationScoreV1,
} from "./contracts.js";
import { digestCanonicalJson, digestContentDocument, hasValidSha256Format } from "./digest.js";

const STATUS_PRECEDENCE: Record<EvaluationGateStatus, number> = {
  pass: 0,
  needs_review: 1,
  not_run: 2,
  fail: 3,
};

function assertScoreShape(score: EvaluationScoreV1): void {
  if (score.schemaVersion !== "evaluation-score.v1") {
    throw new Error(`Score ${score.scoreId} has unsupported schemaVersion ${score.schemaVersion}`);
  }
  const requiredStrings = [
    score.scoreId,
    score.scenarioId,
    score.attemptId,
    score.capability,
    score.criterionId,
    score.evaluatorId,
    score.evaluatorVersion,
  ];
  if (requiredStrings.some((value) => value.trim().length === 0)) {
    throw new Error("Evaluation scores require non-empty identity, capability, criterion, and evaluator fields");
  }
  if (score.evidence.some((locator) => locator.artifactId.trim().length === 0)) {
    throw new Error(`Score ${score.scoreId} contains an empty evidence artifact ID`);
  }
  if (score.status === "fail" && score.evidence.length === 0) {
    throw new Error(`Failed score ${score.scoreId} must carry an evidence locator`);
  }
  if (score.riskTier === "p0_blocker" && score.evaluatorKind === "model" && score.gateAuthority) {
    throw new Error(`Model evaluator ${score.evaluatorId} cannot own P0 gate authority`);
  }
  if (score.veto && !score.gateAuthority) {
    throw new Error(`Score ${score.scoreId} cannot veto without gate authority`);
  }
}

function effectiveVeto(score: EvaluationScoreV1): boolean {
  return score.gateAuthority && score.status === "fail" && (score.veto || score.riskTier === "p0_blocker");
}

function determineCapabilityStatus(
  scores: EvaluationScoreV1[],
  missingEvaluatorIds: string[],
): EvaluationGateStatus {
  if (scores.some(effectiveVeto)) return "fail";
  if (scores.length > 0 && scores.every((score) => score.status === "not_run")) return "not_run";
  if (scores.some((score) => score.status === "not_run")) return "not_run";
  if (missingEvaluatorIds.length > 0) return "needs_review";
  if (scores.some((score) => score.status === "needs_review")) return "needs_review";
  if (scores.some((score) => score.status === "fail" && score.gateAuthority)) return "fail";
  return "pass";
}

function aggregateStatus(capabilities: CapabilityGateV1[]): EvaluationGateStatus {
  if (capabilities.length === 0) return "not_run";
  return capabilities.reduce<EvaluationGateStatus>((current, capability) =>
    STATUS_PRECEDENCE[capability.status] > STATUS_PRECEDENCE[current] ? capability.status : current, "pass");
}

function bindingCapabilityNames(criterionIds: readonly string[]): string[] {
  const names = criterionIds
    .map((criterionId) => criterionId.split(/[.-]/, 1)[0]?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? [...new Set(names)].sort() : ["evaluation"];
}

/**
 * Computes a veto-first capability gate. Quality values remain atomic and are
 * never averaged into release authority.
 */
export function evaluateCapabilityGates(
  scenario: EvaluationScenarioDocumentV1,
  attempt: EvaluationAttemptV1,
  scores: EvaluationScoreV1[],
  createdAt: string,
): EvaluationGateResultV1 {
  if (scenario.scenarioId !== attempt.scenario.identityId || scenario.revision !== attempt.scenario.version) {
    throw new Error("Attempt does not identify the supplied Scenario revision");
  }
  if (scenario.contentDigest !== attempt.scenario.contentDigest) {
    throw new Error("Attempt Scenario digest does not match the supplied Scenario");
  }
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("createdAt must be an ISO date-time");
  }

  const scoreIds = new Set<string>();
  scores.forEach((score) => {
    assertScoreShape(score);
    if (scoreIds.has(score.scoreId)) throw new Error(`Duplicate score ID ${score.scoreId}`);
    scoreIds.add(score.scoreId);
    if (score.scenarioId !== scenario.scenarioId || score.attemptId !== attempt.attemptId) {
      throw new Error(`Score ${score.scoreId} does not belong to this Scenario Attempt`);
    }
  });

  const scoresByCapability = new Map<string, EvaluationScoreV1[]>();
  for (const score of scores) {
    const current = scoresByCapability.get(score.capability) ?? [];
    current.push(score);
    scoresByCapability.set(score.capability, current);
  }

  const missingEvaluatorIdsByCapability = new Map<string, Set<string>>();
  const missingBindings = scenario.evaluatorBindings
    .filter((binding) => binding.requiredForGate)
    .filter((binding) => !scores.some((score) =>
      score.evaluatorId === binding.evaluatorId && score.evaluatorVersion === binding.version));
  for (const binding of missingBindings) {
    for (const capability of bindingCapabilityNames(binding.criterionIds)) {
      const evaluatorIds = missingEvaluatorIdsByCapability.get(capability) ?? new Set<string>();
      evaluatorIds.add(binding.evaluatorId);
      missingEvaluatorIdsByCapability.set(capability, evaluatorIds);
      if (!scoresByCapability.has(capability)) scoresByCapability.set(capability, []);
    }
  }
  if (scoresByCapability.size === 0) scoresByCapability.set("evaluation", []);
  const capabilities: CapabilityGateV1[] = [...scoresByCapability.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, capabilityScores]) => {
      const missingEvaluatorIds = [...(missingEvaluatorIdsByCapability.get(capability) ?? [])].sort();
      const vetoScoreIds = capabilityScores.filter(effectiveVeto).map((score) => score.scoreId).sort();
      const reasonCodes = capabilityScores
        .map((score) => score.reasonCode)
        .filter((reason): reason is string => reason !== undefined)
        .concat(missingEvaluatorIds.length > 0 ? ["missing_required_evaluator"] : [])
        .sort();

      return {
        capability,
        status: determineCapabilityStatus(capabilityScores, missingEvaluatorIds),
        scoreIds: capabilityScores.map((score) => score.scoreId).sort(),
        vetoScoreIds,
        missingEvaluatorIds,
        reasonCodes: [...new Set(reasonCodes)],
      };
    });

  const gateIdentity = digestCanonicalJson({
    scenarioId: scenario.scenarioId,
    attemptId: attempt.attemptId,
    createdAt,
    capabilities,
    scoreIds: [...scoreIds].sort(),
  });
  const withoutDigest = {
    schemaVersion: "evaluation-gate.v1" as const,
    gateId: `gate_${gateIdentity.slice("sha256:".length, "sha256:".length + 32)}`,
    scenarioId: scenario.scenarioId,
    attemptId: attempt.attemptId,
    status: aggregateStatus(capabilities),
    capabilities,
    scores,
    createdAt,
  };
  return {
    ...withoutDigest,
    contentDigest: digestCanonicalJson(withoutDigest),
  };
}

export function validateGateDigest(gate: EvaluationGateResultV1): boolean {
  return hasValidSha256Format(gate.contentDigest) && gate.contentDigest === digestContentDocument(gate);
}
