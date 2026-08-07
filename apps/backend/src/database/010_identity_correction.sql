ALTER TABLE confirmed_states
  DROP CONSTRAINT confirmed_states_status_check;

ALTER TABLE confirmed_states
  ADD CONSTRAINT confirmed_states_status_check CHECK (
    status IN (
      'active',
      'superseded',
      'contested',
      'expired',
      'retracted',
      'deleted'
    )
  );

CREATE TABLE identity_correction_decisions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  root_capture_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  prior_subject_id uuid NOT NULL,
  prior_assignment_id uuid NOT NULL,
  selected_subject_id uuid NOT NULL,
  selected_assignment_id uuid NOT NULL,
  capture_version integer NOT NULL CHECK (capture_version > 0),
  reason text NOT NULL,
  binding_basis text NOT NULL,
  affected_capture_ids uuid[] NOT NULL,
  states_retracted integer NOT NULL CHECK (states_retracted >= 0),
  claims_reopened integer NOT NULL CHECK (claims_reopened >= 0),
  actions_revoked integer NOT NULL CHECK (actions_revoked >= 0),
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, root_capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, prior_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, prior_assignment_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, selected_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, selected_assignment_id)
    REFERENCES assignments(account_id, id)
);

CREATE INDEX identity_correction_decisions_capture_idx
  ON identity_correction_decisions(account_id, root_capture_id, decided_at);
