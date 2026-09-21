-- GET-40 three-scope Memory: proposal, review snapshot, accepted item,
-- independent minimal evidence, receipt, and projection outbox.
-- The three scopes (self, person, relationship) are logical, not physical:
-- resources and lineage are stored once and referenced.

CREATE TABLE memory_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  owner_user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('self', 'person', 'relationship')),
  subject_id uuid,
  relationship_context_id uuid,
  display_text text NOT NULL CHECK (length(btrim(display_text)) > 0),
  statement_kind text NOT NULL CHECK (
    statement_kind IN ('fact', 'source_statement', 'user_opinion')
  ),
  speaker text,
  reporter text,
  valid_time timestamptz,
  observed_time timestamptz,
  time_status text NOT NULL CHECK (
    time_status IN ('known', 'unknown', 'future', 'past')
  ),
  sensitivity text NOT NULL DEFAULT 'normal' CHECK (
    sensitivity IN ('normal', 'sensitive')
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded', 'invalidated', 'deleted')
  ),
  supersedes_id uuid,
  superseded_by_id uuid,
  conflict_group_id uuid,
  source_proposal_id uuid,
  source_proposal_item_id uuid,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  invalidated_reason text,
  deleted_at timestamptz,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, owner_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, relationship_context_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, supersedes_id)
    REFERENCES memory_items(account_id, id),
  FOREIGN KEY (account_id, superseded_by_id)
    REFERENCES memory_items(account_id, id)
);

CREATE INDEX memory_items_recall_idx
  ON memory_items(account_id, scope, subject_id, relationship_context_id)
  WHERE status = 'active';

CREATE INDEX memory_items_owner_self_idx
  ON memory_items(account_id, owner_user_id)
  WHERE status = 'active' AND scope = 'self';

CREATE INDEX memory_items_conflict_group_idx
  ON memory_items(account_id, conflict_group_id)
  WHERE conflict_group_id IS NOT NULL;

-- The accepted minimal excerpt is retained independently of the temporary
-- Session/image under its own authorized retention. Natural TTL never erases
-- it; explicit deletion, authorization revocation, identity rebind, or item
-- deletion makes it unavailable and removes dependent items from recall.
CREATE TABLE memory_item_evidence (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  memory_item_id uuid NOT NULL,
  capture_id uuid,
  source_resource_id uuid,
  evidence_fragment_id uuid,
  source_session_id uuid,
  source_message_id uuid,
  source_task_id uuid,
  locator jsonb NOT NULL CHECK (jsonb_typeof(locator) = 'object'),
  excerpt text NOT NULL CHECK (length(btrim(excerpt)) > 0),
  content_hash text NOT NULL CHECK (length(content_hash) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'revoked')
  ),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, memory_item_id, content_hash),
  FOREIGN KEY (account_id, memory_item_id)
    REFERENCES memory_items(account_id, id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, source_resource_id)
    REFERENCES source_resources(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE INDEX memory_item_evidence_capture_idx
  ON memory_item_evidence(account_id, capture_id)
  WHERE capture_id IS NOT NULL;
CREATE INDEX memory_item_evidence_resource_idx
  ON memory_item_evidence(account_id, source_resource_id)
  WHERE source_resource_id IS NOT NULL;
CREATE INDEX memory_item_evidence_active_idx
  ON memory_item_evidence(account_id, memory_item_id)
  WHERE status = 'active';

CREATE TABLE memory_proposals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_by_user_id uuid NOT NULL,
  proposer_kind text NOT NULL CHECK (proposer_kind IN ('agent', 'human')),
  proposer_name text NOT NULL,
  proposer_version text NOT NULL,
  surface text NOT NULL CHECK (surface IN ('chat', 'people', 'relationship')),
  session_id uuid,
  source_task_id uuid,
  source_message_id uuid,
  target_person_id uuid,
  target_relationship_context_id uuid,
  contact_decision text NOT NULL CHECK (
    contact_decision IN ('existing', 'new', 'none')
  ),
  contact_status text NOT NULL CHECK (
    contact_status IN ('resolved', 'ambiguous', 'pending')
  ),
  person_display_label text,
  target_revision integer NOT NULL CHECK (target_revision > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'partially_committed', 'committed', 'dismissed', 'expired')
  ),
  frozen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (account_id, id),
  UNIQUE (account_id, source_task_id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, target_person_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, target_relationship_context_id)
    REFERENCES assignments(account_id, id)
);

CREATE INDEX memory_proposals_owner_idx
  ON memory_proposals(account_id, created_by_user_id, status, created_at DESC);
CREATE INDEX memory_proposals_expiry_idx
  ON memory_proposals(expires_at)
  WHERE status IN ('open', 'partially_committed');

CREATE TABLE memory_proposal_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('self', 'person', 'relationship')),
  operation text NOT NULL CHECK (operation IN ('add', 'update', 'contest')),
  statement_kind text NOT NULL CHECK (
    statement_kind IN ('fact', 'source_statement', 'user_opinion')
  ),
  display_text text NOT NULL CHECK (length(btrim(display_text)) > 0),
  previous_text text,
  previous_memory_item_id uuid,
  previous_revision integer,
  subject_id uuid,
  relationship_context_id uuid,
  speaker text,
  reporter text,
  valid_time timestamptz,
  observed_time timestamptz,
  time_status text NOT NULL CHECK (
    time_status IN ('known', 'unknown', 'future', 'past')
  ),
  sensitivity text NOT NULL DEFAULT 'normal' CHECK (
    sensitivity IN ('normal', 'sensitive')
  ),
  admission_status text NOT NULL CHECK (
    admission_status IN ('eligible', 'needs_judgment', 'ineligible')
  ),
  admission_reason text,
  default_selected boolean NOT NULL,
  reason text NOT NULL,
  source_excerpt text NOT NULL CHECK (length(btrim(source_excerpt)) > 0),
  source_excerpt_hash text NOT NULL,
  locator jsonb NOT NULL CHECK (jsonb_typeof(locator) = 'object'),
  capture_id uuid,
  source_resource_id uuid,
  evidence_fragment_id uuid,
  content_hash text NOT NULL,
  added_revision integer NOT NULL CHECK (added_revision > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'committed', 'skipped')
  ),
  committed_memory_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, id, proposal_id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  FOREIGN KEY (account_id, previous_memory_item_id)
    REFERENCES memory_items(account_id, id),
  FOREIGN KEY (account_id, committed_memory_item_id)
    REFERENCES memory_items(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, relationship_context_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, source_resource_id)
    REFERENCES source_resources(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE INDEX memory_proposal_items_pending_idx
  ON memory_proposal_items(account_id, proposal_id, added_revision, id)
  WHERE status = 'pending';

CREATE TABLE memory_review_scopes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  proposal_revision integer NOT NULL CHECK (proposal_revision > 0),
  reader_user_id uuid NOT NULL,
  surface text NOT NULL CHECK (surface IN ('chat', 'people', 'relationship')),
  allowed_scope text NOT NULL CHECK (
    allowed_scope IN ('all', 'person_relationship', 'relationship')
  ),
  person_id uuid,
  relationship_context_id uuid,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  FOREIGN KEY (account_id, reader_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX memory_review_scopes_reader_idx
  ON memory_review_scopes(account_id, reader_user_id, proposal_id, surface);

CREATE TABLE memory_review_drafts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  review_scope_id uuid NOT NULL,
  reader_user_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  contact_decision text NOT NULL CHECK (
    contact_decision IN ('existing', 'new', 'none')
  ),
  selected_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  edited_text jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(edited_text) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (account_id, review_scope_id, reader_user_id),
  FOREIGN KEY (account_id, review_scope_id)
    REFERENCES memory_review_scopes(account_id, id),
  FOREIGN KEY (account_id, reader_user_id)
    REFERENCES users(account_id, id)
);

CREATE TABLE memory_commits (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  proposal_revision integer NOT NULL CHECK (proposal_revision > 0),
  review_scope_id uuid NOT NULL,
  committed_by_user_id uuid NOT NULL,
  operation_key uuid NOT NULL,
  contact_decision text NOT NULL CHECK (
    contact_decision IN ('existing', 'new', 'none')
  ),
  created_person_id uuid,
  created_relationship_context_id uuid,
  status text NOT NULL DEFAULT 'applied' CHECK (
    status IN ('applied', 'undone')
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, committed_by_user_id, operation_key),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES memory_proposals(account_id, id),
  FOREIGN KEY (account_id, review_scope_id)
    REFERENCES memory_review_scopes(account_id, id),
  FOREIGN KEY (account_id, committed_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, created_person_id)
    REFERENCES subjects(account_id, id)
);

CREATE INDEX memory_commits_operation_idx
  ON memory_commits(account_id, committed_by_user_id, operation_key);

CREATE TABLE memory_commit_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  commit_id uuid NOT NULL,
  proposal_item_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('add', 'update', 'contest')),
  scope text NOT NULL CHECK (scope IN ('self', 'person', 'relationship')),
  memory_item_id uuid NOT NULL,
  memory_item_version integer NOT NULL CHECK (memory_item_version > 0),
  previous_memory_item_id uuid,
  previous_version integer,
  edited_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, commit_id, proposal_item_id),
  FOREIGN KEY (account_id, commit_id)
    REFERENCES memory_commits(account_id, id),
  FOREIGN KEY (account_id, proposal_item_id)
    REFERENCES memory_proposal_items(account_id, id),
  FOREIGN KEY (account_id, memory_item_id)
    REFERENCES memory_items(account_id, id)
);

CREATE TABLE memory_receipts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  commit_id uuid NOT NULL,
  operation_key uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'undone')),
  contact_decision text NOT NULL CHECK (
    contact_decision IN ('existing', 'new', 'none')
  ),
  created_person_id uuid,
  person_display_label text,
  created_relationship_context_id uuid,
  item_count integer NOT NULL CHECK (item_count >= 0),
  created_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  updated_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  skipped_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(changes) = 'array'
  ),
  undo_token uuid NOT NULL,
  projection_status text NOT NULL DEFAULT 'pending' CHECK (
    projection_status IN ('pending', 'rebuilt', 'not_required')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, commit_id),
  UNIQUE (account_id, operation_key),
  FOREIGN KEY (account_id, commit_id)
    REFERENCES memory_commits(account_id, id)
);

CREATE INDEX memory_receipts_owner_idx
  ON memory_receipts(account_id, created_at DESC);

-- Outbox for Wiki/index rebuild. Domain truth commits before the derived
-- projection; a delayed rebuild never blocks recall of the authority record.
CREATE TABLE memory_projection_jobs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  subject_id uuid,
  relationship_context_id uuid,
  reason text NOT NULL CHECK (
    reason IN ('memory_committed', 'memory_undone', 'memory_corrected', 'memory_deleted', 'source_invalidated')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'rebuilt')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  rebuilt_at timestamptz
);

CREATE INDEX memory_projection_jobs_due_idx
  ON memory_projection_jobs(account_id, status, created_at)
  WHERE status = 'pending';

-- Lab test workspaces must classify new account-scoped tables explicitly.
INSERT INTO lab_test_workspace_table_manifest(table_name, scope) VALUES
  ('memory_items', 'account'),
  ('memory_item_evidence', 'account'),
  ('memory_proposals', 'account'),
  ('memory_proposal_items', 'account'),
  ('memory_review_scopes', 'account'),
  ('memory_review_drafts', 'account'),
  ('memory_commits', 'account'),
  ('memory_commit_items', 'account'),
  ('memory_receipts', 'account'),
  ('memory_projection_jobs', 'account');

DO $$
DECLARE item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'memory_items', 'memory_item_evidence', 'memory_proposals',
    'memory_proposal_items', 'memory_review_scopes', 'memory_review_drafts',
    'memory_commits', 'memory_commit_items', 'memory_receipts',
    'memory_projection_jobs'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard()',
      item
    );
  END LOOP;
END $$;

-- Hidden SDK working context must not survive an accepted Memory change.
-- Reuse the existing account source-generation invalidation.
CREATE TRIGGER invalidate_harness_memory AFTER INSERT OR UPDATE OR DELETE ON memory_items
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
