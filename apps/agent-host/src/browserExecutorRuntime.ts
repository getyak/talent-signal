import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browseDiscoveredPublicPage, browserRuntimeIsHealthy } from "./isolatedPublicBrowser.js";
import { sweepAbandonedBrowserContainers } from "./browserContainerCleanup.js";

const run = promisify(execFile);
export function createBrowserExecutorRuntime(environment: NodeJS.ProcessEnv) {
  const socket = environment.TALENT_SIGNAL_BROWSER_DOCKER_SOCKET;
  const daemonID = environment.TALENT_SIGNAL_BROWSER_DAEMON_ID;
  const image = environment.TALENT_SIGNAL_BROWSER_IMAGE;
  if (!socket?.startsWith("/") || socket.includes("\0") || !daemonID || !/^[a-zA-Z0-9:._-]{1,128}$/u.test(daemonID)
    || !image || !/^sha256:[a-f0-9]{64}$/u.test(image)) throw new Error("BROWSER_DAEMON_NOT_CONFIGURED");
  // DOCKER_CONTEXT overrides DOCKER_HOST. Do not inherit it, a default context,
  // proxy variables, model secrets, or arbitrary Docker configuration.
  // https://docs.docker.com/reference/cli/docker/#environment-variables
  const searchPath = environment.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
  if (searchPath.split(":").some(path => !path.startsWith("/") || path.includes("\0"))) throw new Error("BROWSER_EXECUTOR_PATH_INVALID");
  const env: NodeJS.ProcessEnv = { PATH: searchPath,
    HOME: "/var/empty", DOCKER_CONFIG: "/var/empty", DOCKER_HOST: `unix://${socket}` };
  async function verify(signal: AbortSignal) {
    signal.throwIfAborted();
    const { stdout } = await run("docker", ["info", "--format", "{{.ID}}"], { env, signal, timeout: 3_000, maxBuffer: 1_024 });
    if (stdout.trim() !== daemonID) throw new Error("BROWSER_DAEMON_IDENTITY_MISMATCH");
    const { stdout: found } = await run("docker", ["image", "inspect", "--format", "{{.Id}}", image!], { env, signal, timeout: 3_000, maxBuffer: 1_024 });
    if (found.trim() !== image) throw new Error("BROWSER_IMAGE_IDENTITY_MISMATCH");
  }
  return {
    async health() {
      if (!browserRuntimeIsHealthy()) throw new Error("BROWSER_CLEANUP_UNVERIFIED");
      await verify(AbortSignal.timeout(7_000));
      if (!browserRuntimeIsHealthy()) throw new Error("BROWSER_CLEANUP_UNVERIFIED");
    },
    async initialize() {
      await verify(AbortSignal.timeout(7_000));
      await sweepAbandonedBrowserContainers(env);
    },
    async browse(url: string, signal: AbortSignal) {
      await verify(signal);
      return browseDiscoveredPublicPage(url, signal, { ...env, TALENT_SIGNAL_BROWSER_IMAGE: image });
    },
  };
}
