-- GET-40 review corrections: explicit subject dependence, per-item human
-- judgment, purpose-bound review credentials, and original source lineage.

ALTER TABLE memory_proposal_items
  ADD COLUMN subject_kind text NOT NULL DEFAULT 'resolved_subject'
    CHECK (subject_kind IN ('owner_self', 'resolved_subject', 'proposal_target')),
  ADD COLUMN relationship_kind text NOT NULL DEFAULT 'none'
    CHECK (relationship_kind IN ('none', 'resolved_context', 'proposal_target_context')),
  ADD COLUMN judgment_kind text NOT NULL DEFAULT 'ordinary'
    CHECK (judgment_kind IN (
      'ordinary', 'conflict', 'sensitive', 'ambiguous_attribution',
      'stale_target', 'self_scope_escape'
    )),
  ADD COLUMN original_display_text text,
  ADD COLUMN previous_owner_user_id uuid,
  ADD COLUMN source_artifact_id text,
  ADD COLUMN source_session_id uuid,
  ADD COLUMN source_message_id uuid;

UPDATE memory_proposal_items
SET subject_kind = CASE WHEN scope = 'self' THEN 'owner_self' ELSE 'resolved_subject' END,
    relationship_kind = CASE
      WHEN scope = 'relationship' AND relationship_context_id IS NOT NULL
        THEN 'resolved_context'
      ELSE 'none'
    END;
UPDATE memory_proposal_items
SET original_display_text = display_text
WHERE original_display_text IS NULL;
ALTER TABLE memory_proposal_items
  ALTER COLUMN original_display_text SET NOT NULL;

ALTER TABLE memory_item_evidence
  ADD COLUMN source_artifact_id text,
  ADD COLUMN source_authorization_revision text;

ALTER TABLE memory_review_scopes
  ADD COLUMN purpose text NOT NULL DEFAULT 'chat'
    CHECK (purpose IN ('chat', 'people', 'relationship')),
  ADD COLUMN credential_hash text NOT NULL DEFAULT 'unbound',
  ADD COLUMN source_session_id uuid,
  ADD COLUMN source_message_id uuid;
UPDATE memory_review_scopes SET purpose = surface;
ALTER TABLE memory_review_scopes ALTER COLUMN credential_hash DROP DEFAULT;

ALTER TABLE memory_commit_items
  ADD COLUMN decision text NOT NULL DEFAULT 'accept'
    CHECK (decision IN ('accept', 'keep_old', 'retain_conflict', 'skip'));

ALTER TABLE memory_review_drafts
  ADD COLUMN item_decisions jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(item_decisions) = 'object'),
  ADD COLUMN proposal_id uuid;
UPDATE memory_review_drafts d
SET proposal_id = s.proposal_id
FROM memory_review_scopes s
WHERE s.account_id = d.account_id AND s.id = d.review_scope_id;
ALTER TABLE memory_review_drafts ALTER COLUMN proposal_id SET NOT NULL;
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'memory_review_drafts'::regclass AND contype = 'u';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE memory_review_drafts DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE memory_review_drafts
  ADD CONSTRAINT memory_review_drafts_proposal_fk
    FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  ADD CONSTRAINT memory_review_drafts_proposal_unique
    UNIQUE (account_id, proposal_id, reader_user_id);
ALTER TABLE memory_review_drafts
  ALTER COLUMN review_scope_id DROP NOT NULL;

ALTER TABLE memory_items
  ADD COLUMN original_display_text text;

ALTER TABLE memory_proposals
  ADD COLUMN superseded_by_proposal_id uuid,
  ADD COLUMN rebase_count integer NOT NULL DEFAULT 0 CHECK (rebase_count >= 0),
  ADD CONSTRAINT memory_proposals_superseded_by_fk
    FOREIGN KEY (account_id, superseded_by_proposal_id)
    REFERENCES memory_proposals(account_id, id);

CREATE TABLE memory_proposal_rebases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  from_revision integer NOT NULL CHECK (from_revision > 0),
  to_revision integer NOT NULL CHECK (to_revision > 0),
  reason text NOT NULL,
  previous_person_id uuid,
  previous_relationship_context_id uuid,
  person_id uuid,
  relationship_context_id uuid,
  requeued_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  dropped_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX memory_proposal_rebases_proposal_idx
  ON memory_proposal_rebases(account_id, proposal_id, created_at DESC);

INSERT INTO lab_test_workspace_table_manifest(table_name, scope)
VALUES ('memory_proposal_rebases', 'account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON memory_proposal_rebases
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
