import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => {}, {
  [Symbol.for("nodejs.util.promisify.custom")]: state.run,
}) }));
const id = "f".repeat(64);
const missing = () => Object.assign(new Error("Container disappeared"), { stderr: "Error: No such object: owned-container" });
beforeEach(() => { vi.resetModules(); state.run.mockReset(); });
describe("owned browser container cleanup", () => {
  it("accepts a container disappearing between inventory and inspect", async () => {
    state.run.mockResolvedValueOnce({ stdout: id }).mockRejectedValueOnce(missing());
    const { sweepAbandonedBrowserContainers } = await import("./browserContainerCleanup.js");
    await sweepAbandonedBrowserContainers({});
    await sweepAbandonedBrowserContainers({});
    expect(state.run).toHaveBeenCalledTimes(2);
    expect(state.run.mock.calls.map(call => call[1][0])).toEqual(["ps", "inspect"]);
  });
  it("preserves this live instance but removes an abandoned instance with exact ownership", async () => {
    const { sweepAbandonedBrowserContainers, browserContainerLabels } = await import("./browserContainerCleanup.js");
    const labels = Object.fromEntries(browserContainerLabels.filter(value => value !== "--label").map(value => {
      const at = value.indexOf("="); return [value.slice(0, at), value.slice(at + 1)];
    }));
    state.run.mockResolvedValueOnce({ stdout: `${id}\n${"a".repeat(64)}` })
      .mockResolvedValueOnce({ stdout: JSON.stringify(labels) })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ ...labels, "ts.browser.instance": "abandoned-prior-process" }) })
      .mockResolvedValueOnce({ stdout: "removed" });
    await sweepAbandonedBrowserContainers({});
    expect(state.run.mock.calls.filter(call => call[1][0] === "rm").map(call => call[1])).toEqual([["rm", "--force", "a".repeat(64)]]);
  });
  it("keeps daemon failures distinct from verified absence", async () => {
    state.run.mockResolvedValueOnce({ stdout: id }).mockRejectedValueOnce(Object.assign(new Error("Daemon unavailable"), { stderr: "Cannot connect to Docker daemon" }));
    const { sweepAbandonedBrowserContainers } = await import("./browserContainerCleanup.js");
    await expect(sweepAbandonedBrowserContainers({})).rejects.toThrow("Daemon unavailable");
    expect(state.run.mock.calls.some(call => call[1][0] === "rm")).toBe(false);
  });
  it("verifies automatic removal completion after an in-progress result", async () => {
    state.run.mockRejectedValueOnce(Object.assign(new Error("Removing"), { stderr: "removal of container is already in progress" }))
      .mockRejectedValueOnce(missing());
    const { removeBrowserContainer } = await import("./browserContainerCleanup.js");
    await removeBrowserContainer("owned", {});
    expect(state.run.mock.calls.map(call => call[1][0])).toEqual(["rm", "inspect"]);
  });
});
