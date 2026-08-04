import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./database/pool.js";

const config = loadConfig();
const pool = createPool(config);
const app = await buildApp({ config, pool });

async function shutdown(signal: string): Promise<void> {
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
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "Local control plane failed to start");
  await pool.end();
  process.exitCode = 1;
}
