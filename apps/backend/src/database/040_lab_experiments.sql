-- Synthetic-only quality records. No foreign key or write path to product state.
CREATE TABLE lab_experiments (
  id uuid NOT NULL,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  request_hash text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (account_id, user_id, id),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id),
  CHECK (record->>'business_write_count' = '0'),
  CHECK (record->>'provider_call_limit' = '2'),
  CHECK (jsonb_array_length(record->'models') = 2),
  CHECK (jsonb_array_length(record->'results') <= 2)
);
CREATE INDEX lab_experiments_expiry_idx ON lab_experiments(expires_at);
