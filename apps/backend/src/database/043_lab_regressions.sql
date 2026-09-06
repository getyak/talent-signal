-- Human-selected synthetic failure snapshots. Content is immutable until deletion/expiry.
CREATE TABLE lab_regressions (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  request_hash text NOT NULL, content_hash text NOT NULL, snapshot jsonb,
  parent_id uuid REFERENCES lab_regressions(id),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
  deleted_at timestamptz, deleted_job_ids uuid[] NOT NULL DEFAULT '{}',
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id),
  CHECK(snapshot IS NULL OR snapshot->>'data_class'='registered_synthetic')
);
CREATE INDEX lab_regressions_owner ON lab_regressions(account_id,user_id,created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE lab_experiment_jobs ADD COLUMN regression_id uuid REFERENCES lab_regressions(id);
CREATE INDEX lab_jobs_regression ON lab_experiment_jobs(regression_id) WHERE regression_id IS NOT NULL;
