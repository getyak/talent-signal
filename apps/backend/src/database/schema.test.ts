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

  it("adds reviewed screenshot transcription as an explicit source scope", async () => {
    const sql = await readFile(
      new URL("./003_reviewed_extracted_text.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("'reviewed_extracted_text'");
    expect(sql).toContain(
      "DROP CONSTRAINT source_retention_receipts_source_scope_check",
    );
  });

  it("adds multichannel resources, stable identity resolution, and compiled knowledge", async () => {
    const sql = await readFile(
      new URL("./004_relationship_resources.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "source_resources",
      "evidence_fragments",
      "identity_handles",
      "identity_resolution_cases",
      "identity_resolution_candidates",
      "identity_resolution_decisions",
      "research_tasks",
      "research_snapshots",
      "knowledge_snapshots",
      "knowledge_blocks",
      "knowledge_dependencies",
      "context_manifests",
      "context_manifest_blocks",
      "context_manifest_evidence",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain(
      "CREATE UNIQUE INDEX identity_handles_one_confirmed_owner_idx",
    );
    expect(sql).toContain(
      "ON identity_handles(account_id, handle_type, normalized_value_hash)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, subject_id)\n    REFERENCES subjects(account_id, id)",
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX knowledge_snapshots_one_published_context_idx",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, knowledge_snapshot_id)\n    REFERENCES knowledge_snapshots(account_id, id)",
    );
  });

  it("makes confirmed identity clues temporal and auditable", async () => {
    const sql = await readFile(
      new URL("./016_identity_handle_freshness.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("'expired'");
    expect(sql).toContain("ADD COLUMN version integer");
    expect(sql).toContain(
      "CREATE INDEX identity_handles_freshness_expiry_idx",
    );
    expect(sql).toContain(
      "CREATE TABLE identity_handle_lifecycle_events",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, identity_handle_id)",
    );
  });

  it("versions identity freshness policy and preserves override basis", async () => {
    const sql = await readFile(
      new URL("./017_identity_freshness_policy.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain(
      "CREATE TABLE identity_handle_freshness_policies",
    );
    expect(sql).toContain(
      "identity_handle_freshness_one_open_policy_idx",
    );
    expect(sql).toContain(
      "'identity-freshness-2026-08-07.v1'",
    );
    expect(sql).toContain("ADD COLUMN freshness_policy_version");
    expect(sql).toContain("ADD COLUMN validity_basis");
    expect(sql).toContain("ADD COLUMN validity_override_reason");
    expect(sql).toContain("'human_override'");
    expect(sql).toContain(
      "identity_handle_lifecycle_freshness_policy_fk",
    );
  });

  it("makes published freshness policy immutable and non-overlapping", async () => {
    const sql = await readFile(
      new URL(
        "./018_identity_freshness_policy_immutability.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain(
      "CREATE FUNCTION enforce_identity_freshness_policy_immutability",
    );
    expect(sql).toContain(
      "CREATE TRIGGER identity_freshness_policy_immutable",
    );
    expect(sql).toContain("TG_OP = 'DELETE'");
    expect(sql).toContain(
      "only one-way retirement is allowed",
    );
    expect(sql).toContain("effective intervals cannot overlap");
  });

  it("makes identity, context, and source dependencies explicit", async () => {
    const sql = await readFile(
      new URL("./005_knowledge_dependency_scope.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("'identity_binding'");
    expect(sql).toContain("'relationship_context'");
    expect(sql).toContain("'source_resource'");
    expect(sql).toContain(
      "DROP CONSTRAINT knowledge_dependencies_dependency_type_check",
    );
  });

  it("separates extraction review from attribution and records duplicate lineage", async () => {
    const sql = await readFile(
      new URL("./006_resource_intake_review.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN review_status");
    expect(sql).toContain(
      "review_status IN ('proposed', 'reviewed', 'rejected')",
    );
    expect(sql).toContain("'document_text'");
    expect(sql).toContain("ADD COLUMN duplicate_of_resource_id uuid");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, duplicate_of_resource_id)",
    );
    expect(sql).toContain("'resource_intake_committed'");
    expect(sql).toContain(
      "DROP CONSTRAINT source_retention_events_reason_check",
    );
  });

  it("records every evidence-fragment review as an account-scoped decision", async () => {
    const sql = await readFile(
      new URL("./007_evidence_fragment_review.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE evidence_fragment_reviews");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, fragment_id)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, decided_by_user_id)",
    );
  });

  it("binds every new research task to its governed seed resource", async () => {
    const sql = await readFile(
      new URL("./008_research_seed_lineage.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN seed_resource_id uuid");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, seed_resource_id)",
    );
    expect(sql).toContain(
      "REFERENCES source_resources(account_id, id)",
    );
  });

  it("links general resource claims to their exact evidence fragments", async () => {
    const sql = await readFile(
      new URL("./009_resource_claim_provenance.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN evidence_fragment_id uuid");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, evidence_fragment_id)",
    );
    expect(sql).toContain(
      "REFERENCES evidence_fragments(account_id, id)",
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX proposed_assertions_one_resource_claim_idx",
    );
  });

  it("records reversible identity corrections and preserves retracted fact history", async () => {
    const sql = await readFile(
      new URL("./010_identity_correction.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("'retracted'");
    expect(sql).toContain(
      "CREATE TABLE identity_correction_decisions",
    );
    expect(sql).toContain("affected_capture_ids uuid[] NOT NULL");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, root_capture_id)",
    );
    expect(sql).toContain(
      "CREATE INDEX identity_correction_decisions_capture_idx",
    );
  });

  it("separates evidence authorization from raw-source retention", async () => {
    const sql = await readFile(
      new URL("./011_source_authorization.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain(
      "ADD COLUMN authorization_state text NOT NULL DEFAULT 'authorized'",
    );
    expect(sql).toContain(
      "ADD COLUMN authorization_reason text NOT NULL DEFAULT 'capture_authorized'",
    );
    expect(sql).toContain(
      "CREATE TABLE source_authorization_decisions",
    );
    expect(sql).toContain("affected_capture_ids uuid[] NOT NULL");
    expect(sql).toContain(
      "CREATE INDEX source_authorization_decisions_capture_idx",
    );
  });

  it("expires evidence authorization on its own governed clock", async () => {
    const sql = await readFile(
      new URL("./012_source_authorization_expiry.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN authorization_expires_at");
    expect(sql).toContain("'authorization_expired'");
    expect(sql).toContain("'expire'");
    expect(sql).toContain(
      "transition_actor IN ('human', 'system')",
    );
    expect(sql).toContain(
      "CREATE INDEX source_authorization_expiry_idx",
    );
  });

  it("recovers source-authorization recompilation after process loss", async () => {
    const sql = await readFile(
      new URL(
        "./013_source_authorization_compilation_jobs.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain(
      "CREATE TABLE source_authorization_compilation_jobs",
    );
    expect(sql).toContain(
      "status IN ('pending', 'running', 'retry', 'completed')",
    );
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, decision_id)",
    );
    expect(sql).toContain(
      "CREATE INDEX source_authorization_compilation_jobs_due_idx",
    );
    expect(sql).toContain(
      "CREATE INDEX source_authorization_compilation_jobs_expired_lease_idx",
    );
  });

  it("records versioned reversible person merges without flattening relationship contexts", async () => {
    const sql = await readFile(
      new URL("./015_reversible_person_merges.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE person_merge_operations");
    expect(sql).toContain("merged_into_subject_id uuid");
    expect(sql).toContain("affected_assignment_ids uuid[] NOT NULL");
    expect(sql).toContain("affected_capture_ids uuid[] NOT NULL");
    expect(sql).toContain("invalidated_snapshot_ids uuid[] NOT NULL");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX person_merge_operations_one_active_source_idx",
    );
    expect(sql).toContain("status IN ('active', 'merged', 'deleted')");
  });

  it("recovers bounded research retrieval after process loss", async () => {
    const sql = await readFile(
      new URL("./014_research_retrieval_jobs.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE research_retrieval_jobs");
    expect(sql).toContain("request_body jsonb NOT NULL");
    expect(sql).toContain(
      "status IN ('pending', 'running', 'retry', 'completed')",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, task_id)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, idempotency_record_id)",
    );
    expect(sql).toContain(
      "CREATE INDEX research_retrieval_jobs_due_idx",
    );
    expect(sql).toContain(
      "CREATE INDEX research_retrieval_jobs_expired_lease_idx",
    );
  });
});
