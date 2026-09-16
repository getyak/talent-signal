import type { PoolClient } from "pg";

/** Serialize selected-person task admission with contact archival. */
export async function lockContactTaskPerson(
  client: PoolClient,
  accountID: string,
  personID: string,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${accountID}:screenshot-contact-person:${personID}`,
  ]);
}
