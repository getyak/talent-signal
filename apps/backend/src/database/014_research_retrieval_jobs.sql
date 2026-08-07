CREATE TABLE research_retrieval_jobs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  request_body jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'retry', 'completed')),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (account_id, task_id),
  FOREIGN KEY (account_id, task_id)
    REFERENCES research_tasks(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, requested_by_user_id)
    REFERENCES users(account_id, id),
  CHECK (
    (status = 'running' AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_owner IS NULL
      AND lease_expires_at IS NULL)
  ),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR
    (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX research_retrieval_jobs_due_idx
  ON research_retrieval_jobs(
    available_at,
    created_at,
    id
  )
  WHERE status IN ('pending', 'retry');

CREATE INDEX research_retrieval_jobs_expired_lease_idx
  ON research_retrieval_jobs(
    lease_expires_at,
    created_at,
    id
  )
  WHERE status = 'running';
