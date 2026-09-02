import { describe, expect, it } from "vitest";

import { createDatasetSyncPlan } from "./syncDataset.js";
import { makeScenario, makeSuite } from "../testFixtures.testHelper.js";

describe("digest-based Opik dataset sync", () => {
  it("produces a stable dry-run and becomes a no-op at the same digest", () => {
    const scenario = makeScenario();
    const suite = makeSuite(scenario);
    const initial = createDatasetSyncPlan({
      projectName: "talent-signal-pursuit-agent",
      datasetName: "test-suite",
      suite,
      scenarios: [scenario],
      ownerControlledInstance: true,
      dryRun: true,
    });
    expect(initial.operation).toBe("create");
    const repeated = createDatasetSyncPlan({
      projectName: initial.projectName,
      datasetName: initial.datasetName,
      suite,
      scenarios: [scenario],
      ownerControlledInstance: true,
      dryRun: true,
      remote: { datasetDigest: initial.desiredDatasetDigest },
    });
    expect(repeated.operation).toBe("noop");
    expect(repeated.items[0]).not.toHaveProperty("input");
    expect(repeated.items[0]).not.toHaveProperty("oracle");
  });
});
