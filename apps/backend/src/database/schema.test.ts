import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("authority schema", () => {
  it("keeps lifecycle records in separate tables", async () => {
    const sql = await readFile(
      new URL("./001_authority.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "captures",
      "evidence_items",
      "proposed_assertions",
      "fact_decisions",
      "confirmed_states",
      "action_proposals",
      "action_approvals",
      "effect_attempts",
      "effect_observations",
      "outcomes",
      "audit_events",
      "deletion_lineage",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
  });

  it("uses composite account-scoped relationships", async () => {
    const sql = await readFile(
      new URL("./001_authority.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("FOREIGN KEY (account_id, capture_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, action_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, assertion_id)");
  });
});
