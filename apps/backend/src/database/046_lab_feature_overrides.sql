-- Named Lab feature overrides are temporary, session-scoped presentation experiments.
-- Product adoption receipts are frozen onto context manifests so later changes cannot rewrite history.
ALTER TABLE context_manifests
  ADD COLUMN lab_feature_receipt jsonb;

CREATE TABLE lab_feature_overrides (
  id uuid NOT NULL,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  feature_id text NOT NULL CHECK (feature_id IN ('relationship_evidence_preview')),
  request_hash text NOT NULL,
  record jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active','stopped','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, user_id, id),
  FOREIGN KEY (account_id, user_id, auth_session_id)
    REFERENCES sessions(account_id, user_id, id),
  CHECK (record->>'scope' = 'this_authenticated_session'),
  CHECK (expires_at <= created_at + interval '61 minutes')
);

CREATE UNIQUE INDEX lab_feature_overrides_one_active
  ON lab_feature_overrides(account_id,user_id,auth_session_id,feature_id)
  WHERE status='active';
CREATE INDEX lab_feature_overrides_retention ON lab_feature_overrides(created_at);
