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

  it("adds an account-scoped source-retention receipt and lifecycle", async () => {
    const sql = await readFile(
      new URL("./002_source_retention.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE source_retention_receipts");
    expect(sql).toContain("CREATE TABLE source_retention_events");
    expect(sql).toContain("UNIQUE (account_id, capture_id)");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)",
    );
    expect(sql).toContain(
      "source_access_state IN ('available', 'purged', 'deleted')",
    );
    const legacyBackfill = sql.slice(
      sql.indexOf("INSERT INTO source_retention_receipts("),
    );
    expect(legacyBackfill).toContain("'legacy_unknown'");
    expect(legacyBackfill).toContain("'legacy_unverified'");
    expect(legacyBackfill).toContain("ELSE 'purged'");
    expect(legacyBackfill).toContain("content_hash = 'legacy-unverified'");
    expect(legacyBackfill).toContain("'source_purged'");
    expect(legacyBackfill).toContain(
      "source_access_reason = 'legacy_unverified'",
    );
    expect(legacyBackfill).not.toContain(
      "'full_source',\n  'full_source',\n  'full_reviewed_source'",
    );
  });
});
