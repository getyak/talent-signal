-- GET-40 review round 2: directed relationship ownership, source revocation
-- ledger, multi-credential review scopes, dismissals, and source-version binding.

-- A new-contact relationship label is not a stable context id.
ALTER TABLE memory_proposals
  ADD COLUMN relationship_display_label text,
  ADD COLUMN source_revision_hash text,
  ADD COLUMN identity_authority text NOT NULL DEFAULT 'tentative'
    CHECK (identity_authority IN ('tentative', 'stable_handle', 'human_selection'));

ALTER TABLE memory_proposal_items
  ADD COLUMN source_revision_hash text;

-- Explicit deletion/revocation/rebind of a bound source. The ledger is written
-- in the same transaction as the deletion so a pending proposal cannot commit
-- resurrected content. Natural TTL is deliberately absent.
CREATE TABLE memory_source_revocations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  source_kind text NOT NULL CHECK (source_kind IN ('session', 'capture', 'artifact')),
  source_id text NOT NULL,
  reason text NOT NULL CHECK (
    reason IN ('source_deleted', 'identity_rebound', 'source_revoked')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, source_kind, source_id)
);

CREATE INDEX memory_source_revocations_lookup_idx
  ON memory_source_revocations(account_id, source_kind, source_id);

-- One review scope may have several independently rendered credentials. Opening
-- a second tab no longer invalidates the first; a stale commit still reconciles
-- on the proposal revision.
CREATE TABLE memory_review_credentials (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  review_scope_id uuid NOT NULL,
  credential_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE (account_id, credential_hash),
  FOREIGN KEY (account_id, review_scope_id)
    REFERENCES memory_review_scopes(account_id, id)
);

CREATE INDEX memory_review_credentials_scope_idx
  ON memory_review_credentials(account_id, review_scope_id)
  WHERE revoked_at IS NULL;

-- Source/revision-scoped no-save ledgers. A dismissal never creates memory,
-- a contact, or a commit receipt.
CREATE TABLE memory_proposal_dismissals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  proposal_revision integer NOT NULL CHECK (proposal_revision > 0),
  review_scope_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('chat', 'people', 'relationship')),
  dismissed_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  reason text NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  FOREIGN KEY (account_id, review_scope_id)
    REFERENCES memory_review_scopes(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX memory_proposal_dismissals_source_idx
  ON memory_proposal_dismissals(account_id, proposal_id, proposal_revision);

INSERT INTO lab_test_workspace_table_manifest(table_name, scope) VALUES
  ('memory_source_revocations', 'account'),
  ('memory_review_credentials', 'account'),
  ('memory_proposal_dismissals', 'account');

CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON memory_source_revocations
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON memory_review_credentials
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON memory_proposal_dismissals
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
