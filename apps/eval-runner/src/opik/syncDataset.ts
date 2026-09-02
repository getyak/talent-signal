import {
  digestCanonicalJson,
  type EvaluationScenarioV1,
  type EvaluationSuiteV1,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import type { DatasetSyncPlanV1, SafeDatasetItemV1 } from "../contracts.js";
import { SAFE_EXPORT_POLICY_VERSION, decideExport, scanSafeExport } from "../safeExportPolicy.js";

export interface RemoteDatasetStateV1 {
  datasetDigest?: Sha256Digest;
}

export function stableDatasetItemId(scenario: EvaluationScenarioV1): string {
  return `scenario:${scenario.scenarioId}:${scenario.revision}`;
}

function toSafeItem(scenario: EvaluationScenarioV1): SafeDatasetItemV1 {
  const item: SafeDatasetItemV1 = {
    id: stableDatasetItemId(scenario),
    scenarioId: scenario.scenarioId,
    revision: scenario.revision,
    scenarioDigest: scenario.contentDigest,
    suiteIds: [...scenario.suiteIds],
    riskTier: scenario.riskTier,
    lifecycle: scenario.lifecycle,
    adjudication: scenario.adjudication,
    partition: scenario.partition,
    dataClass: scenario.dataPolicy.dataClass,
    slices: { ...scenario.slices },
  };
  scanSafeExport(item);
  return item;
}

export function createDatasetSyncPlan(input: {
  projectName: string;
  datasetName: string;
  suite: EvaluationSuiteV1;
  scenarios: readonly EvaluationScenarioV1[];
  ownerControlledInstance: boolean;
  dryRun: boolean;
  remote?: RemoteDatasetStateV1;
}): DatasetSyncPlanV1 {
  const registrations = new Map(
    input.suite.scenarios.map((item) => [`${item.scenarioId}@${item.revision}`, item]),
  );
  const selected = input.scenarios.filter((scenario) =>
    registrations.has(`${scenario.scenarioId}@${scenario.revision}`),
  );
  if (selected.length !== registrations.size) {
    throw new Error(
      `Suite ${input.suite.suiteId} resolves ${selected.length}/${registrations.size} scenarios`,
    );
  }
  for (const scenario of selected) {
    const decision = decideExport(scenario, input.ownerControlledInstance);
    if (!decision.allowed) {
      throw new Error(`Dataset projection denied for ${scenario.scenarioId}: ${decision.reasonCode}`);
    }
  }
  const items = selected.map(toSafeItem).sort((left, right) => left.id.localeCompare(right.id));
  const desiredDatasetDigest = digestCanonicalJson({
    suiteDigest: input.suite.contentDigest,
    policyVersion: SAFE_EXPORT_POLICY_VERSION,
    items,
  });
  const operation =
    input.remote?.datasetDigest === desiredDatasetDigest
      ? "noop"
      : input.remote?.datasetDigest
        ? "replace_changed"
        : "create";
  return {
    schemaVersion: "evaluation-dataset-sync-plan.v1",
    policyVersion: SAFE_EXPORT_POLICY_VERSION,
    projectName: input.projectName,
    datasetName: input.datasetName,
    suiteId: input.suite.suiteId,
    suiteVersion: input.suite.version,
    suiteDigest: input.suite.contentDigest,
    desiredDatasetDigest,
    dryRun: input.dryRun,
    operation,
    itemCount: items.length,
    items,
    ...(input.remote?.datasetDigest === undefined
      ? {}
      : { priorDigest: input.remote.datasetDigest }),
  };
}
