import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ run: vi.fn(), browse: vi.fn(), sweep: vi.fn(), healthy: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: (...args: unknown[]) => {
  const callback = args.pop() as (error: Error | null, result?: { stdout: string; stderr: string }) => void;
  void fixture.run(...args).then((stdout: string) => callback(null, { stdout, stderr: "" }), (error: Error) => callback(error));
} }));
vi.mock("./isolatedPublicBrowser.js", () => ({ browseDiscoveredPublicPage: fixture.browse, browserRuntimeIsHealthy: fixture.healthy }));
vi.mock("./browserContainerCleanup.js", () => ({ sweepAbandonedBrowserContainers: fixture.sweep }));
import { createBrowserExecutorRuntime } from "./browserExecutorRuntime.js";

const image = `sha256:${"a".repeat(64)}`;
const environment = { TALENT_SIGNAL_BROWSER_DOCKER_SOCKET: "/owned/docker.sock", TALENT_SIGNAL_BROWSER_DAEMON_ID: "dedicated-daemon",
  TALENT_SIGNAL_BROWSER_IMAGE: image, DOCKER_CONTEXT: "default", DOCKER_HOST: "unix:///wrong.sock", ANTHROPIC_API_KEY: "must-not-cross", HTTPS_PROXY: "http://wrong/" };
beforeEach(() => { vi.clearAllMocks(); fixture.healthy.mockReturnValue(true); fixture.run.mockImplementation(async (_command, args) => args[0] === "info" ? "dedicated-daemon\n" : image); });
it("rechecks cleanup health after asynchronous daemon verification", async () => {
  fixture.healthy.mockReturnValueOnce(true).mockReturnValueOnce(false);
  await expect(createBrowserExecutorRuntime(environment).health()).rejects.toThrow("CLEANUP_UNVERIFIED");
  expect(fixture.run).toHaveBeenCalledTimes(2);
});
it("pins every Docker operation to the explicit socket and removes inherited credentials/context", async () => {
  const runtime = createBrowserExecutorRuntime(environment);
  await runtime.initialize();
  await runtime.browse("https://example.com/", new AbortController().signal);
  expect(fixture.run).toHaveBeenCalledTimes(4);
  const safe = { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", HOME: "/var/empty", DOCKER_CONFIG: "/var/empty", DOCKER_HOST: "unix:///owned/docker.sock" };
  for (const call of fixture.run.mock.calls) expect(call[2].env).toEqual(safe);
  expect(fixture.sweep).toHaveBeenCalledWith(safe);
  expect(fixture.browse).toHaveBeenCalledWith("https://example.com/", expect.any(AbortSignal), { ...safe, TALENT_SIGNAL_BROWSER_IMAGE: image });
});
it("denies missing config, changed daemon and missing image before cleanup or browse", async () => {
  expect(() => createBrowserExecutorRuntime({ DOCKER_CONTEXT: "default" })).toThrow("NOT_CONFIGURED");
  const runtime = createBrowserExecutorRuntime(environment);
  fixture.run.mockResolvedValueOnce("other-daemon");
  await expect(runtime.initialize()).rejects.toThrow("DAEMON_IDENTITY_MISMATCH");
  fixture.run.mockResolvedValueOnce("dedicated-daemon").mockResolvedValueOnce("another-image");
  await expect(runtime.browse("https://example.com/", new AbortController().signal)).rejects.toThrow("IMAGE_IDENTITY_MISMATCH");
  expect(fixture.sweep).not.toHaveBeenCalled();
  expect(fixture.browse).not.toHaveBeenCalled();
});
