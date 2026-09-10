import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./database/pool.js";
import { runSourceLifecycleSweep } from "./modules/sourceLifecycle.js";
import { recoverInterruptedAgentRuns } from "./modules/agentRuns.js";
import { recoverGovernedAgentTasks } from "./modules/agentTasks.js";
import { sweepClaudeHarnessWorkspaces } from "@talent-signal/agent";

const config = loadConfig();
const pool = createPool(config);
const app = await buildApp({ config, pool });
let workspaceSweep: ReturnType<typeof setInterval> | undefined;
let sweeping = false;

async function shutdown(signal: string): Promise<void> {
  clearInterval(workspaceSweep);
  app.log.info({ signal }, "Stopping local control plane");
  await app.close();
  await pool.end();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await sweepClaudeHarnessWorkspaces();
  workspaceSweep = setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    void sweepClaudeHarnessWorkspaces().catch(() => {
      app.log.error({ code: "HARNESS_WORKSPACE_CLEANUP_FAILED" }, "SDK workspace cleanup requires retry");
    }).finally(() => { sweeping = false; });
  }, 30_000);
  workspaceSweep.unref();
  await recoverInterruptedAgentRuns(pool);
  await app.listen({ host: config.host, port: config.port });
  void recoverGovernedAgentTasks(pool).catch((error: unknown) => {
    app.log.error(
      { err: error },
      "Startup governed Agent Task recovery failed",
    );
  });
  void runSourceLifecycleSweep(pool).catch((error: unknown) => {
    app.log.error(
      { err: error },
      "Startup source lifecycle recovery failed",
    );
  });
} catch (error) {
  app.log.error({ err: error }, "Local control plane failed to start");
  await pool.end();
  process.exitCode = 1;
}
