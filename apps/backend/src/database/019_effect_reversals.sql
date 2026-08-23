CREATE TABLE effect_reversal_approvals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  original_attempt_id uuid NOT NULL,
  approved_by_user_id uuid NOT NULL,
  exact_preview jsonb NOT NULL,
  exact_preview_digest text NOT NULL CHECK (
    exact_preview_digest ~ '^[a-f0-9]{64}$'
  ),
  reason text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('active', 'revoked', 'stale', 'consumed')
  ),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, original_attempt_id)
    REFERENCES effect_attempts(account_id, id),
  FOREIGN KEY (account_id, approved_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE UNIQUE INDEX effect_reversal_approvals_one_active_idx
  ON effect_reversal_approvals(account_id, original_attempt_id)
  WHERE status = 'active';

CREATE TABLE effect_reversal_attempts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  original_attempt_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  capability_grant_id uuid NOT NULL,
  exact_preview_digest text NOT NULL CHECK (
    exact_preview_digest ~ '^[a-f0-9]{64}$'
  ),
  adapter text NOT NULL CHECK (adapter = 'local_deterministic'),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (
    status IN ('running', 'verified', 'failed', 'unknown')
  ),
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, original_attempt_id, attempt_number),
  FOREIGN KEY (account_id, original_attempt_id)
    REFERENCES effect_attempts(account_id, id),
  FOREIGN KEY (account_id, approval_id)
    REFERENCES effect_reversal_approvals(account_id, id),
  FOREIGN KEY (account_id, capability_grant_id)
    REFERENCES capability_grants(account_id, id)
);

CREATE TABLE effect_reversal_observations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  reversal_attempt_id uuid NOT NULL,
  destination_key text NOT NULL,
  destination_version integer,
  observed_state jsonb,
  match_status text NOT NULL CHECK (
    match_status IN ('matched_absent', 'still_present', 'unavailable')
  ),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, reversal_attempt_id)
    REFERENCES effect_reversal_attempts(account_id, id)
);

CREATE TABLE effect_reversal_outcomes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  reversal_attempt_id uuid NOT NULL,
  observation_id uuid,
  status text NOT NULL CHECK (status IN ('verified', 'failed', 'unknown')),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, reversal_attempt_id)
    REFERENCES effect_reversal_attempts(account_id, id),
  FOREIGN KEY (account_id, observation_id)
    REFERENCES effect_reversal_observations(account_id, id)
);
