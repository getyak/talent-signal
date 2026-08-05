CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, slug)
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  email text NOT NULL,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind = 'simulated_human'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, email)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  client_label text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
);

CREATE INDEX sessions_active_token_idx
  ON sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE subjects (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  external_ref text NOT NULL,
  display_label text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, external_ref)
);

CREATE TABLE assignments (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  subject_id uuid NOT NULL,
  external_ref text NOT NULL,
  display_label text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, external_ref),
  FOREIGN KEY (account_id, subject_id) REFERENCES subjects(account_id, id)
);

CREATE TABLE capability_grants (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  capability text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, user_id, capability),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
);

CREATE TABLE captures (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  created_by_user_id uuid NOT NULL,
  subject_id uuid,
  assignment_id uuid,
  fixture_case_id text,
  source_kind text NOT NULL,
  source_metadata jsonb NOT NULL,
  identity_status text NOT NULL CHECK (
    identity_status IN ('bound', 'ambiguous', 'unbound')
  ),
  identity_context jsonb NOT NULL,
  purpose text NOT NULL,
  retention_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, subject_id) REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id) REFERENCES assignments(account_id, id)
);

CREATE INDEX captures_account_updated_idx ON captures(account_id, updated_at DESC);

CREATE TABLE evidence_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  source_message_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  speaker text NOT NULL CHECK (
    speaker IN ('candidate', 'recruiter', 'hiring_manager', 'unknown')
  ),
  redacted_text text,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, capture_id, source_message_id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);

CREATE TABLE analysis_proposals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  disposition text NOT NULL CHECK (
    disposition IN ('propose_action', 'no_action', 'clarify', 'block')
  ),
  producer_kind text NOT NULL,
  producer_name text NOT NULL,
  producer_version text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);

CREATE TABLE proposed_assertions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  analysis_proposal_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  field text NOT NULL,
  proposal_status text NOT NULL CHECK (
    proposal_status IN ('proposed', 'ambiguous', 'superseded')
  ),
  review_status text NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'confirmed', 'dismissed', 'unresolved', 'deleted')
  ),
  proposed_value text,
  evidence_quote text,
  subject_kind text NOT NULL CHECK (
    subject_kind IN ('candidate', 'hiring_manager', 'unknown')
  ),
  temporal_relation text NOT NULL CHECK (
    temporal_relation IN ('new', 'reinforces', 'supersedes')
  ),
  supersedes_state_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, analysis_proposal_id)
    REFERENCES analysis_proposals(account_id, id),
  FOREIGN KEY (account_id, evidence_id) REFERENCES evidence_items(account_id, id)
);

CREATE TABLE fact_decisions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  assertion_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (
    decision IN ('confirm', 'dismiss', 'leave_unresolved')
  ),
  proposed_value_at_decision text,
  corrected_value text,
  assertion_version integer NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, assertion_id)
    REFERENCES proposed_assertions(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id) REFERENCES users(account_id, id)
);

CREATE TABLE confirmed_states (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  field text NOT NULL,
  value_text text,
  status text NOT NULL CHECK (
    status IN ('active', 'superseded', 'contested', 'expired', 'deleted')
  ),
  source_assertion_id uuid NOT NULL,
  confirmed_by_decision_id uuid NOT NULL,
  supersedes_state_id uuid,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, subject_id) REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id) REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, source_assertion_id)
    REFERENCES proposed_assertions(account_id, id),
  FOREIGN KEY (account_id, confirmed_by_decision_id)
    REFERENCES fact_decisions(account_id, id),
  FOREIGN KEY (account_id, supersedes_state_id)
    REFERENCES confirmed_states(account_id, id)
);

CREATE UNIQUE INDEX confirmed_states_one_active_field_idx
  ON confirmed_states(account_id, assignment_id, field)
  WHERE status = 'active';

ALTER TABLE proposed_assertions
  ADD CONSTRAINT proposed_assertions_supersedes_state_fk
  FOREIGN KEY (account_id, supersedes_state_id)
  REFERENCES confirmed_states(account_id, id);

CREATE TABLE action_proposals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  analysis_proposal_id uuid NOT NULL,
  proposed_by_kind text NOT NULL,
  action_type text NOT NULL CHECK (action_type = 'prepare_question'),
  owner_kind text NOT NULL CHECK (owner_kind = 'recruiter'),
  target_text text,
  reason_text text,
  due_text text,
  evidence_ids uuid[] NOT NULL,
  required_assertion_ids uuid[] NOT NULL,
  exact_preview jsonb NOT NULL,
  exact_preview_digest text NOT NULL,
  simulated boolean NOT NULL CHECK (simulated),
  status text NOT NULL DEFAULT 'proposed' CHECK (
    status IN (
      'proposed', 'approved', 'executing', 'unknown', 'completed', 'failed',
      'revoked', 'deleted'
    )
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, analysis_proposal_id)
    REFERENCES analysis_proposals(account_id, id)
);

CREATE TABLE action_approvals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  action_id uuid NOT NULL,
  approved_by_user_id uuid NOT NULL,
  action_version integer NOT NULL,
  exact_preview_digest text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('active', 'revoked', 'stale', 'consumed')
  ),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, action_id) REFERENCES action_proposals(account_id, id),
  FOREIGN KEY (account_id, approved_by_user_id) REFERENCES users(account_id, id)
);

CREATE INDEX action_approvals_current_idx
  ON action_approvals(account_id, action_id, status, expires_at);

CREATE TABLE effect_attempts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  action_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  capability_grant_id uuid NOT NULL,
  action_version integer NOT NULL,
  exact_preview_digest text NOT NULL,
  adapter text NOT NULL CHECK (adapter = 'local_deterministic'),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (
    status IN ('running', 'verified', 'failed', 'unknown')
  ),
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, action_id, attempt_number),
  FOREIGN KEY (account_id, action_id) REFERENCES action_proposals(account_id, id),
  FOREIGN KEY (account_id, approval_id) REFERENCES action_approvals(account_id, id),
  FOREIGN KEY (account_id, capability_grant_id)
    REFERENCES capability_grants(account_id, id)
);

CREATE TABLE simulated_destinations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  destination_key text NOT NULL,
  state jsonb NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, destination_key)
);

CREATE TABLE effect_observations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  destination_key text NOT NULL,
  destination_version integer,
  observed_state jsonb,
  match_status text NOT NULL CHECK (
    match_status IN ('matched', 'mismatched', 'unavailable')
  ),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, attempt_id) REFERENCES effect_attempts(account_id, id)
);

CREATE TABLE outcomes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  observation_id uuid,
  status text NOT NULL CHECK (status IN ('verified', 'failed', 'unknown')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, attempt_id) REFERENCES effect_attempts(account_id, id),
  FOREIGN KEY (account_id, observation_id)
    REFERENCES effect_observations(account_id, id)
);

CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  reason text NOT NULL,
  access_revoked_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, requested_by_user_id) REFERENCES users(account_id, id)
);

CREATE TABLE deletion_lineage (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  deletion_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  disposition text NOT NULL CHECK (
    disposition IN ('content_removed', 'access_revoked', 'audit_reference_retained')
  ),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, deletion_id, entity_type, entity_id),
  FOREIGN KEY (account_id, deletion_id)
    REFERENCES deletion_requests(account_id, id)
);

CREATE TABLE audit_events (
  sequence bigserial PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  actor_user_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id, id)
);

CREATE INDEX audit_events_account_sequence_idx
  ON audit_events(account_id, sequence);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  actor_user_id uuid NOT NULL,
  operation_scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (account_id, actor_user_id, operation_scope, idempotency_key),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id, id)
);
