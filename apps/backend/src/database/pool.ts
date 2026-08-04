import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { BackendConfig } from "../config.js";

export type DatabaseClient = Pool | PoolClient;

export function createPool(config: BackendConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    application_name: "talent-signal-local-control-plane",
    max: 12,
    statement_timeout: 10_000,
    query_timeout: 12_000,
  });
}

export async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function oneOrNull<Row extends QueryResultRow>(
  client: DatabaseClient,
  text: string,
  values: unknown[] = [],
): Promise<Row | null> {
  const result = await client.query<Row>(text, values);
  return result.rows[0] ?? null;
}
