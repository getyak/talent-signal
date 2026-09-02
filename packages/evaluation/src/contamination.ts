import type { EvaluationScenarioV1 } from "./contracts.js";

export type ContaminationKind =
  | "scenario_id_cross_partition"
  | "content_digest_cross_partition"
  | "fixture_digest_cross_partition"
  | "source_lineage_cross_partition"
  | "semantic_near_duplicate";

export interface PartitionContaminationFindingV1 {
  kind: ContaminationKind;
  leftScenarioId: string;
  rightScenarioId: string;
  leftPartition: EvaluationScenarioV1["partition"];
  rightPartition: EvaluationScenarioV1["partition"];
  similarity?: number;
  sharedIdentity?: string;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or",
  "that", "the", "this", "to", "with", "scenario", "synthetic", "verify", "must", "without",
  "evaluation", "candidate", "recruiter", "system",
]);

function semanticTokens(scenario: EvaluationScenarioV1): Set<string> {
  const semanticSurface = {
    title: scenario.title,
    purpose: scenario.purpose,
    input: scenario.input,
    oracle: {
      observations: scenario.oracle.observations.map((item) => ({
        operator: item.operator,
        actualPath: item.actualPath,
        expected: item.expected,
      })),
      identity: scenario.oracle.identity,
      transitions: scenario.oracle.transitions.map((item) => ({
        operation: item.operation,
        target: item.target,
        authority: item.authority,
      })),
      terminal: scenario.oracle.terminal,
      proposal: scenario.oracle.proposal,
      allowedEffects: scenario.oracle.allowedEffects,
      forbidden: scenario.oracle.forbidden.map((item) => ({ code: item.code, description: item.description })),
    },
  };
  const words = JSON.stringify(semanticSurface)
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}_.:-]*/gu) ?? [];
  return new Set(words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / union.size;
}

function orderedPair(left: EvaluationScenarioV1, right: EvaluationScenarioV1) {
  return left.scenarioId.localeCompare(right.scenarioId) <= 0
    ? [left, right] as const
    : [right, left] as const;
}

/**
 * Deterministic contamination scan across the mutually exclusive P0, dev,
 * held-out, and red-team partitions. It combines exact identities, lineage,
 * fixture hashes, and a conservative semantic-near-duplicate signal.
 */
export function scanPartitionContamination(
  scenarios: readonly EvaluationScenarioV1[],
  semanticThreshold = 0.9,
): PartitionContaminationFindingV1[] {
  if (semanticThreshold <= 0 || semanticThreshold > 1) {
    throw new Error("semanticThreshold must be in (0, 1]");
  }
  const findings: PartitionContaminationFindingV1[] = [];
  const tokens = new Map(scenarios.map((scenario) => [scenario, semanticTokens(scenario)]));
  for (let leftIndex = 0; leftIndex < scenarios.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scenarios.length; rightIndex += 1) {
      const leftCandidate = scenarios[leftIndex];
      const rightCandidate = scenarios[rightIndex];
      if (!leftCandidate || !rightCandidate || leftCandidate.partition === rightCandidate.partition) continue;
      const [left, right] = orderedPair(leftCandidate, rightCandidate);
      const base = {
        leftScenarioId: left.scenarioId,
        rightScenarioId: right.scenarioId,
        leftPartition: left.partition,
        rightPartition: right.partition,
      };
      if (left.scenarioId === right.scenarioId) {
        findings.push({ kind: "scenario_id_cross_partition", ...base, sharedIdentity: left.scenarioId });
      }
      if (left.contentDigest === right.contentDigest) {
        findings.push({ kind: "content_digest_cross_partition", ...base, sharedIdentity: left.contentDigest });
      }
      const leftFixtureDigests = new Set([
        left.modelInputRef.contentDigest,
        left.initialStateRef.contentDigest,
        left.oracleRef.contentDigest,
      ]);
      const sharedFixture = [
        right.modelInputRef.contentDigest,
        right.initialStateRef.contentDigest,
        right.oracleRef.contentDigest,
      ].find((item) => leftFixtureDigests.has(item));
      if (sharedFixture) {
        findings.push({ kind: "fixture_digest_cross_partition", ...base, sharedIdentity: sharedFixture });
      }
      const leftSources = new Set(left.lineage.sourceIds);
      const sharedSource = right.lineage.sourceIds.find((item) => leftSources.has(item));
      if (sharedSource) {
        findings.push({ kind: "source_lineage_cross_partition", ...base, sharedIdentity: sharedSource });
      }
      const similarity = jaccard(tokens.get(left) ?? new Set(), tokens.get(right) ?? new Set());
      if (similarity >= semanticThreshold) {
        findings.push({ kind: "semantic_near_duplicate", ...base, similarity });
      }
    }
  }
  return findings.sort((left, right) =>
    `${left.kind}:${left.leftScenarioId}:${left.rightScenarioId}`.localeCompare(
      `${right.kind}:${right.leftScenarioId}:${right.rightScenarioId}`,
    ));
}

export function assertNoPartitionContamination(
  scenarios: readonly EvaluationScenarioV1[],
  semanticThreshold = 0.9,
): void {
  const findings = scanPartitionContamination(scenarios, semanticThreshold);
  if (findings.length > 0) {
    throw new Error(`Evaluation partition contamination detected: ${JSON.stringify(findings)}`);
  }
}
