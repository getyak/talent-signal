import type { SyncResponse } from "@talent-signal/contracts";
import type { Pool } from "pg";

import type { AuthContext } from "./auth.js";

export async function readSyncEvents(
  pool: Pool,
  auth: AuthContext,
  after: number,
): Promise<SyncResponse> {
  const result = await pool.query<{
    sequence: string;
    event_type: string;
    entity_type: string;
    entity_id: string;
    occurred_at: Date;
    metadata: Record<string, unknown>;
  }>(
    `SELECT
       sequence, event_type, entity_type, entity_id, occurred_at, metadata
     FROM audit_events
     WHERE account_id = $1 AND sequence > $2
     ORDER BY sequence
     LIMIT 250`,
    [auth.accountId, after],
  );
  const events = result.rows.map((event) => ({
    sequence: Number(event.sequence),
    event_type: event.event_type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    occurred_at: event.occurred_at.toISOString(),
    metadata: event.metadata,
  }));
  return {
    after,
    next_cursor: events.at(-1)?.sequence ?? after,
    events,
  };
}
