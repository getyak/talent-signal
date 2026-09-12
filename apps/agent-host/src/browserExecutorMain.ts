import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { BROWSER_EXECUTOR_PORT } from "./browserExecutorProtocol.js";
import { startBrowserExecutorServer } from "./browserExecutorServer.js";

// Launch this trusted process with env -i and only the documented operator
// configuration. It has host-user privileges; only the browser is sandboxed.
const tokenFile = process.env.TALENT_SIGNAL_BROWSER_EXECUTOR_TOKEN_FILE;
const allowed = new Set(["PATH", "HOME", "__CF_USER_TEXT_ENCODING", "TALENT_SIGNAL_BROWSER_EXECUTOR_TOKEN_FILE",
  "TALENT_SIGNAL_BROWSER_DOCKER_SOCKET", "TALENT_SIGNAL_BROWSER_DAEMON_ID", "TALENT_SIGNAL_BROWSER_IMAGE"]);
if (Object.keys(process.env).some(key => !allowed.has(key))) throw new Error("BROWSER_EXECUTOR_REQUIRES_CLEAN_ENVIRONMENT");
if (!tokenFile?.startsWith("/")) throw new Error("BROWSER_EXECUTOR_TOKEN_FILE_REQUIRED");
const file = await open(tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
let token: string;
try {
  const metadata = await file.stat();
  if (!metadata.isFile() || metadata.size > 128 || (metadata.mode & 0o077) !== 0
    || metadata.uid !== process.getuid?.()) throw new Error("BROWSER_EXECUTOR_TOKEN_FILE_UNSAFE");
  token = (await file.readFile("utf8")).trim();
} finally { await file.close(); }
// Check launcher inputs before native image libraries initialize their own
// runtime variables through the shared safe-fetch dependency graph.
const { createBrowserExecutorRuntime } = await import("./browserExecutorRuntime.js");
const runtime = createBrowserExecutorRuntime(process.env);
const executor = await startBrowserExecutorServer({ token, port: BROWSER_EXECUTOR_PORT, ...runtime });
process.stdout.write(JSON.stringify({ event: "browser_executor_ready", address: "127.0.0.1", port: BROWSER_EXECUTOR_PORT }) + "\n");
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
  if (stopping) return;
  stopping = true;
  void executor.close().then(() => process.exit(0), () => process.exit(1));
});
