import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";
import { createPool } from "./pool.js";

const VERSION = "001_authority";

export async function migrate(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const builtSqlPath = fileURLToPath(
    new URL("./001_authority.sql", import.meta.url),
  );
  const sourceSqlPath = fileURLToPath(
    new URL("../../src/database/001_authority.sql", import.meta.url),
  );
  const sql = await readFile(builtSqlPath, "utf8").catch(
    async () => readFile(sourceSqlPath, "utf8"),
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const existing = await client.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE version = $1",
      [VERSION],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(
          `Migration ${VERSION} differs from the already applied checksum.`,
        );
      }
      await client.query("COMMIT");
      return;
    }

    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
      [VERSION, checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error: unknown) => {
    process.stderr.write(
      `Migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
