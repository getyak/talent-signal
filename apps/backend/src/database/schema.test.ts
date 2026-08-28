import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("authority schema", () => {
  it("keeps Chat media scoped, lifecycle-aware, and distinct from evidence", async () => {
    const sql = await readFile(
      new URL("./031_chat_media_assets.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE chat_media_assets");
    expect(sql).toContain("CREATE TABLE context_manifest_media");
    expect(sql).toContain("UNIQUE (account_id, media_id)");
    expect(sql).toContain("status IN ('pending', 'ready', 'failed', 'deleted')");
    expect(sql).not.toContain("evidence_fragments");
    expect(sql).not.toContain("source_resources");
  });

  it("keeps user-authored person profiles separate from evidence", async () => {
    const sql = await readFile(
      new URL("./030_person_profiles.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE person_profiles");
    expect(sql).toContain("provenance_kind = 'user_authored'");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, subject_id)\n    REFERENCES subjects(account_id, id)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, authored_by_user_id)\n    REFERENCES users(account_id, id)",
    );
    expect(sql).not.toContain("evidence_items");
    expect(sql).not.toContain("confirmed_states");
  });

  it("keeps password identity server-owned and account-scoped", async () => {
    const sql = await readFile(
      new URL("./028_password_auth.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE password_credentials");
    expect(sql).toContain("users_password_username_unique_idx");
    expect(sql).toContain("users_password_email_unique_idx");
    expect(sql).toContain("'password_human'");
    expect(sql).toContain("account_role IN ('admin', 'member')");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)",
    );
  });

  it("accepts the versioned scrypt delimiter without rewriting migration history", async () => {
    const sql = await readFile(
      new URL("./029_password_credential_constraint.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain(
      "^scrypt[$]v1[$][a-f0-9]{32,128}[$][a-f0-9]{128}$",
    );
    expect(sql).toContain(
      "DROP CONSTRAINT password_credentials_password_scrypt_check",
    );
  });

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

  it("persists a monotonic, same-fragment evidence-review authority chain", async () => {
    const sql = await readFile(
      new URL("./027_evidence_review_authority_chain.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN prior_review_id uuid");
    expect(sql).toContain("ADD COLUMN review_revision integer");
    expect(sql).toContain(
      "UNIQUE (account_id, fragment_id, review_revision)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, fragment_id, prior_review_id)",
    );
    expect(sql).toContain(
      "REFERENCES evidence_fragment_reviews(account_id, fragment_id, id)",
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

  it("separates effect reversal approval, execution, observation, and outcome", async () => {
    const sql = await readFile(
      new URL("./019_effect_reversals.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "effect_reversal_approvals",
      "effect_reversal_attempts",
      "effect_reversal_observations",
      "effect_reversal_outcomes",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("effect_reversal_approvals_one_active_idx");
    expect(sql).toContain("status IN ('active', 'revoked', 'stale', 'consumed')");
    expect(sql).toContain("match_status IN ('matched_absent', 'still_present', 'unavailable')");
  });

  it("adds an account-scoped Pursuit aggregate with auditable operations and receipts", async () => {
    const sql = await readFile(
      new URL("./020_pursuit_domain.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "organizations",
      "pursuits",
      "pursuit_roles",
      "pursuit_role_evidence",
      "pursuit_criteria",
      "pursuit_gaps",
      "pursuit_gap_evidence",
      "pursuit_actions",
      "pursuit_operations",
      "pursuit_receipts",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("FOREIGN KEY (account_id, pursuit_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, person_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, organization_id)");
    expect(sql).toContain("FOREIGN KEY (account_id, evidence_fragment_id)");
    expect(sql).toContain("jsonb_array_length(external_effects) = 0");
    expect(sql).toContain(
      "status IN ('confirming', 'applied', 'conflict', 'failed', 'unknown_locked')",
    );
    expect(sql).toContain("UNIQUE (account_id, operation_id)");
  });

  it("adds item-level Pursuit Proposal review without external effects", async () => {
    const sql = await readFile(
      new URL("./021_pursuit_proposal_review.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "pursuit_proposals",
      "pursuit_proposal_items",
      "pursuit_proposal_item_evidence",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("review_pursuit_proposal");
    expect(sql).toContain("'confirmed', 'edited', 'rejected', 'kept_unresolved'");
    expect(sql).toContain("FOREIGN KEY (account_id, evidence_fragment_id)");
    expect(sql).toContain("jsonb_array_length(external_effects) = 0");
    expect(sql).toContain("pursuit_operations_proposal_kind_check");
    expect(sql).toContain("pursuit_receipts_proposal_kind_check");
  });

  it("propagates Pursuit evidence authority and preserves authored order", async () => {
    const sql = await readFile(
      new URL("./022_pursuit_evidence_integrity.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("ADD COLUMN basis_kind text");
    expect(sql).toContain("pursuit_role_evidence_fragment_idx");
    expect(sql).toContain("pursuit_gap_evidence_fragment_idx");
    for (const table of [
      "pursuit_roles",
      "pursuit_criteria",
      "pursuit_gaps",
      "pursuit_actions",
    ]) {
      expect(sql).toContain(`ALTER TABLE ${table} ADD COLUMN display_order integer`);
      expect(sql).toContain(`${table}_display_order_idx`);
    }
  });

  it("persists bounded Agent trajectories without payloads or external effects", async () => {
    const sql = await readFile(
      new URL("./023_agent_control_plane.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "agent_runs",
      "agent_run_evidence",
      "agent_run_events",
      "agent_tool_calls",
      "agent_run_outputs",
      "agent_no_actions",
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql).toContain("external_effects = '[]'::jsonb");
    expect(sql).toContain(
      "FOREIGN KEY (account_id, fragment_id)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (account_id, idempotency_record_id)",
    );
    expect(sql).toContain("input_fingerprint text NOT NULL");
    expect(sql).toContain("output_fingerprint text NOT NULL");
    expect(sql).not.toContain("input_payload");
    expect(sql).not.toContain("output_payload");
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
