-- GET-40 phase 2: exact Pursuit association on a derived Memory review scope.
--
-- A Pursuit-derived review must not degrade into an unrestricted relationship
-- scope after it is opened. The exact role, evidence reference, capture epoch
-- and associated person/context are pinned here so every later read, draft,
-- commit, readback and undo can revalidate the same current authority.
--
-- All columns are nullable: non-Pursuit reviews keep NULL and are unaffected.

ALTER TABLE memory_review_scopes
  ADD COLUMN pursuit_id uuid,
  ADD COLUMN pursuit_role_id uuid,
  ADD COLUMN pursuit_role_evidence_fragment_id uuid,
  ADD COLUMN pursuit_capture_id uuid,
  ADD COLUMN pursuit_capture_version integer;

-- A Pursuit-derived review pins the complete association or none of it, and a
-- pinned capture epoch must be positive.
ALTER TABLE memory_review_scopes
  ADD CONSTRAINT memory_review_scopes_pursuit_association_shape CHECK (
    (
      pursuit_id IS NULL
      AND pursuit_role_id IS NULL
      AND pursuit_role_evidence_fragment_id IS NULL
      AND pursuit_capture_id IS NULL
      AND pursuit_capture_version IS NULL
    )
    OR (
      pursuit_id IS NOT NULL
      AND pursuit_role_id IS NOT NULL
      AND pursuit_role_evidence_fragment_id IS NOT NULL
      AND pursuit_capture_id IS NOT NULL
      AND pursuit_capture_version IS NOT NULL
      AND pursuit_capture_version > 0
    )
  );

CREATE INDEX memory_review_scopes_pursuit_idx
  ON memory_review_scopes(account_id, pursuit_id, pursuit_role_id)
  WHERE pursuit_id IS NOT NULL;

-- Stable compensation outcomes, recovered identically after a lost response.
ALTER TABLE memory_receipts
  ADD COLUMN undo_contact_outcome text CHECK (undo_contact_outcome IN ('retained', 'reclaimed')),
  ADD COLUMN undo_context_outcome text CHECK (undo_context_outcome IN ('retained', 'reclaimed'));

-- Natural lifecycle transitions preserve a provable accepted source epoch.
-- No row is recorded for a rebind, manual correction, deletion or revocation.
CREATE TABLE source_natural_epoch_transitions (
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  from_version integer NOT NULL CHECK (from_version > 0),
  to_version integer NOT NULL CHECK (to_version = from_version + 1),
  transition_kind text NOT NULL CHECK (transition_kind IN ('authorization_expired', 'payload_purged')),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, capture_id, from_version),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id) ON DELETE CASCADE
);
INSERT INTO lab_test_workspace_table_manifest(table_name,scope) VALUES ('source_natural_epoch_transitions','account');
CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON source_natural_epoch_transitions
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
