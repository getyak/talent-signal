import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.js";
import { createPool } from "./pool.js";

const MIGRATIONS = [
  "001_authority",
  "002_source_retention",
  "003_reviewed_extracted_text",
  "004_relationship_resources",
  "005_knowledge_dependency_scope",
  "006_resource_intake_review",
  "007_evidence_fragment_review",
  "008_research_seed_lineage",
  "009_resource_claim_provenance",
  "010_identity_correction",
  "011_source_authorization",
  "012_source_authorization_expiry",
  "013_source_authorization_compilation_jobs",
  "014_research_retrieval_jobs",
  "015_reversible_person_merges",
  "016_identity_handle_freshness",
  "017_identity_freshness_policy",
  "018_identity_freshness_policy_immutability",
  "019_effect_reversals",
  "020_pursuit_domain",
  "021_pursuit_proposal_review",
  "022_pursuit_evidence_integrity",
  "023_agent_control_plane",
  "024_pursuit_action_outcome",
  "025_milestone_authority_pointer",
  "026_apple_auth",
  "027_evidence_review_authority_chain",
] as const;

async function migrationSql(version: string): Promise<string> {
  const filename = `${version}.sql`;
  const builtSqlPath = fileURLToPath(new URL(`./${filename}`, import.meta.url));
  const sourceSqlPath = fileURLToPath(
    new URL(`../../src/database/${filename}`, import.meta.url),
  );
  return readFile(builtSqlPath, "utf8").catch(
    async () => readFile(sourceSqlPath, "utf8"),
  );
}

export async function migrate(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const client = await pool.connect();

  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    for (const version of MIGRATIONS) {
      const sql = await migrationSql(version);
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(
            `Migration ${version} differs from the already applied checksum.`,
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
          [version, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } catch (error) {
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
