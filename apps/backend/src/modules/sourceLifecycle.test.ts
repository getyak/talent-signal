import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleMocks = vi.hoisted(() => ({
  compileAuthorizations: vi.fn(),
  research: vi.fn(),
  sweepAuthorizations: vi.fn(),
  sweepIdentityHandles: vi.fn(),
  sweepRetention: vi.fn(),
  purgeArtifacts: vi.fn(),
}));

vi.mock("./sourceAuthorization.js", () => ({
  runPendingSourceAuthorizationCompilationJobs:
    lifecycleMocks.compileAuthorizations,
  sweepDueSourceAuthorizations:
    lifecycleMocks.sweepAuthorizations,
}));
vi.mock("./research.js", () => ({
  runPendingPublicResearchJobs: lifecycleMocks.research,
}));
vi.mock("./identityHandles.js", () => ({
  sweepDueIdentityHandles: lifecycleMocks.sweepIdentityHandles,
}));
vi.mock("./sourceRetention.js", () => ({
  sweepDueSourceRetention: lifecycleMocks.sweepRetention,
}));

vi.mock("./harnessRunFiles.js", () => ({
  purgeUnavailableRunArtifacts: lifecycleMocks.purgeArtifacts,
}));

import { runSourceLifecycleSweep } from "./sourceLifecycle.js";

const completedCompilationJobs = {
  completed: 0,
  failed: 0,
  skipped: 0,
};
const completedResearchJobs = {
  completed: 0,
  failed: 0,
  skipped: 0,
};

describe("source lifecycle sweep coordination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    lifecycleMocks.purgeArtifacts.mockResolvedValue(undefined);
    lifecycleMocks.sweepAuthorizations.mockResolvedValue([]);
    lifecycleMocks.sweepIdentityHandles.mockResolvedValue([]);
    lifecycleMocks.compileAuthorizations.mockResolvedValue(
      completedCompilationJobs,
    );
    lifecycleMocks.research.mockResolvedValue(completedResearchJobs);
  });

  it("coalesces overlapping sweeps for the same pool", async () => {
    let releaseRetention: ((count: number) => void) | undefined;
    lifecycleMocks.sweepRetention.mockReturnValue(
      new Promise<number>((resolve) => {
        releaseRetention = resolve;
      }),
    );
    const pool = {} as Pool;
    const first = runSourceLifecycleSweep(pool);
    const second = runSourceLifecycleSweep(pool);

    expect(second).toBe(first);
    expect(lifecycleMocks.sweepRetention).toHaveBeenCalledTimes(1);

    releaseRetention?.(2);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ raw_sources_purged: 2 }),
      expect.objectContaining({ raw_sources_purged: 2 }),
    ]);

    expect(lifecycleMocks.purgeArtifacts).toHaveBeenCalledExactlyOnceWith(pool);
    lifecycleMocks.sweepRetention.mockResolvedValue(0);
    await runSourceLifecycleSweep(pool);
    expect(lifecycleMocks.sweepRetention).toHaveBeenCalledTimes(2);
  });

  it("releases the pool after a failed sweep", async () => {
    const pool = {} as Pool;
    lifecycleMocks.sweepRetention
      .mockRejectedValueOnce(new Error("synthetic timeout"))
      .mockResolvedValueOnce(1);

    await expect(runSourceLifecycleSweep(pool)).rejects.toThrow(
      "synthetic timeout",
    );
    await expect(runSourceLifecycleSweep(pool)).resolves.toEqual(
      expect.objectContaining({ raw_sources_purged: 1 }),
    );
    expect(lifecycleMocks.sweepRetention).toHaveBeenCalledTimes(2);
  });

  it("releases the pool after artifact cleanup fails", async () => {
    const pool = {} as Pool;
    lifecycleMocks.sweepRetention.mockResolvedValue(0);
    lifecycleMocks.purgeArtifacts
      .mockRejectedValueOnce(new Error("synthetic artifact cleanup failure"))
      .mockResolvedValueOnce(undefined);

    await expect(runSourceLifecycleSweep(pool)).rejects.toThrow(
      "synthetic artifact cleanup failure",
    );
    await expect(runSourceLifecycleSweep(pool)).resolves.toEqual(
      expect.objectContaining({ raw_sources_purged: 0 }),
    );
    expect(lifecycleMocks.purgeArtifacts).toHaveBeenCalledTimes(2);
  });
});
