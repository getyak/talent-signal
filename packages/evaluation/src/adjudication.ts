import type {
  CriterionAdjudicationV1,
  EvaluatorBindingV1,
  ScenarioAdjudication,
  ScenarioOracleV1,
  Sha256Digest,
} from "./contracts.js";
import { digestCanonicalJson } from "./digest.js";

export function collectAdjudicableCriterionIds(
  oracle: ScenarioOracleV1,
  bindings: readonly EvaluatorBindingV1[],
): string[] {
  return [...new Set([
    ...oracle.observations.map((item) => item.criterionId),
    oracle.identity.criterionId,
    ...oracle.transitions.map((item) => item.criterionId),
    oracle.terminal.criterionId,
    ...(oracle.proposal ? [oracle.proposal.criterionId] : []),
    ...oracle.forbidden.map((item) => item.criterionId),
    ...bindings.flatMap((binding) => binding.criterionIds),
  ])].sort();
}

export function deriveScenarioAdjudication(
  adjudications: readonly CriterionAdjudicationV1[],
  allCriterionIds: readonly string[],
): ScenarioAdjudication {
  if (adjudications.some((item) => item.status === "disputed")) return "disputed";
  if (allCriterionIds.length === 0) return "unreviewed";
  const statusByCriterion = new Map(adjudications.map((item) => [item.criterionId, item.status]));
  return allCriterionIds.every((criterionId) => statusByCriterion.get(criterionId) === "human_gold")
    ? "human_gold"
    : "unreviewed";
}

export function digestCriterionAdjudications(
  adjudications: readonly CriterionAdjudicationV1[],
): Sha256Digest {
  return digestCanonicalJson(
    [...adjudications].sort((left, right) => left.criterionId.localeCompare(right.criterionId)),
  );
}
