import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

export interface AuditContext {
  accountId: string;
  actorUserId: string | null;
}

export async function appendAudit(
  client: PoolClient,
  context: AuditContext,
  eventType: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<number> {
  const result = await client.query<{ sequence: string }>(
    `INSERT INTO audit_events(
       id, account_id, actor_user_id, event_type, entity_type, entity_id, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING sequence`,
    [
      randomUUID(),
      context.accountId,
      context.actorUserId,
      eventType,
      entityType,
      entityId,
      metadata,
    ],
  );
  return Number(result.rows[0]?.sequence);
}
