ALTER TABLE source_retention_receipts
  ADD COLUMN authorization_state text NOT NULL DEFAULT 'authorized'
    CHECK (authorization_state IN ('authorized', 'revoked')),
  ADD COLUMN authorization_reason text NOT NULL DEFAULT 'capture_authorized'
    CHECK (
      authorization_reason IN (
        'capture_authorized',
        'recruiter_revoked',
        'recruiter_restored'
      )
    ),
  ADD COLUMN authorization_changed_at timestamptz;

UPDATE source_retention_receipts
SET authorization_changed_at = created_at
WHERE authorization_changed_at IS NULL;

ALTER TABLE source_retention_receipts
  ALTER COLUMN authorization_changed_at SET NOT NULL,
  ALTER COLUMN authorization_changed_at SET DEFAULT now();

CREATE INDEX source_authorization_state_idx
  ON source_retention_receipts(account_id, authorization_state, updated_at);

CREATE TABLE source_authorization_decisions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  root_capture_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('revoke', 'restore')),
  prior_authorization_state text NOT NULL CHECK (
    prior_authorization_state IN ('authorized', 'revoked')
  ),
  authorization_state text NOT NULL CHECK (
    authorization_state IN ('authorized', 'revoked')
  ),
  reason text NOT NULL,
  affected_capture_ids uuid[] NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  capture_version integer NOT NULL CHECK (capture_version > 0),
  states_retracted integer NOT NULL CHECK (states_retracted >= 0),
  prior_states_reopened integer NOT NULL CHECK (
    prior_states_reopened >= 0
  ),
  claims_reopened integer NOT NULL CHECK (claims_reopened >= 0),
  actions_revoked integer NOT NULL CHECK (actions_revoked >= 0),
  identity_handles_returned_to_review integer NOT NULL CHECK (
    identity_handles_returned_to_review >= 0
  ),
  knowledge_snapshots_invalidated uuid[] NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, root_capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id)
);

CREATE INDEX source_authorization_decisions_capture_idx
  ON source_authorization_decisions(
    account_id,
    root_capture_id,
    decided_at DESC
  );
