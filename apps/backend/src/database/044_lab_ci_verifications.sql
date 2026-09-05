-- Verification metadata carries no candidate content and is never execution authority.
CREATE TABLE lab_ci_verifications (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  regression_id uuid NOT NULL REFERENCES lab_regressions(id),
  request_hash text NOT NULL, receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id)
);
CREATE INDEX lab_ci_verifications_owner ON lab_ci_verifications(account_id,user_id,regression_id,created_at DESC);
