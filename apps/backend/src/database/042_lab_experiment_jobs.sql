-- Synthetic-only batch definitions and individually reserved provider attempts.
CREATE TABLE lab_experiment_jobs (
  id uuid NOT NULL, account_id uuid NOT NULL, user_id uuid NOT NULL,
  request_hash text NOT NULL, definition_hash text NOT NULL, definition jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','running','cancelling','cancelled','completed','partial','failed','unknown')),
  calls_reserved integer NOT NULL DEFAULT 0 CHECK(calls_reserved >= 0),
  review text NOT NULL DEFAULT 'unreviewed', failure_categories jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  cancel_requested_at timestamptz, lease_id uuid, lease_expires_at timestamptz,
  PRIMARY KEY(account_id,user_id,id), UNIQUE(id),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id),
  CHECK(definition->>'business_write_count'='0')
);
CREATE INDEX lab_jobs_queue ON lab_experiment_jobs(created_at) WHERE status='queued';
CREATE INDEX lab_jobs_lease ON lab_experiment_jobs(lease_expires_at) WHERE status IN ('running','cancelling');
CREATE TABLE lab_experiment_attempts (
  id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES lab_experiment_jobs(id) ON DELETE CASCADE,
  ordinal integer NOT NULL, record jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','dispatching','completed','failed','cancelled','unknown')),
  UNIQUE(job_id,ordinal)
);
CREATE TABLE lab_model_call_budgets (
  account_id uuid NOT NULL REFERENCES accounts(id), day date NOT NULL,
  calls_reserved integer NOT NULL DEFAULT 0 CHECK(calls_reserved >= 0), PRIMARY KEY(account_id,day)
);
