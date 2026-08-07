ALTER TABLE idempotency_records
  ADD CONSTRAINT idempotency_records_account_id_id_key
    UNIQUE (account_id, id);

CREATE TABLE source_authorization_compilation_jobs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  transition_actor text NOT NULL
    CHECK (transition_actor IN ('human', 'system')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'retry', 'completed')),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  knowledge_snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (account_id, decision_id),
  FOREIGN KEY (account_id, decision_id)
    REFERENCES source_authorization_decisions(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, requested_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, assignment_id)
    REFERENCES assignments(account_id, id),
  FOREIGN KEY (account_id, knowledge_snapshot_id)
    REFERENCES knowledge_snapshots(account_id, id),
  CHECK (
    (status = 'running' AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_owner IS NULL
      AND lease_expires_at IS NULL)
  ),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL
      AND knowledge_snapshot_id IS NOT NULL)
    OR
    (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX source_authorization_compilation_jobs_due_idx
  ON source_authorization_compilation_jobs(
    available_at,
    created_at,
    id
  )
  WHERE status IN ('pending', 'retry');

CREATE INDEX source_authorization_compilation_jobs_expired_lease_idx
  ON source_authorization_compilation_jobs(
    lease_expires_at,
    created_at,
    id
  )
  WHERE status = 'running';
