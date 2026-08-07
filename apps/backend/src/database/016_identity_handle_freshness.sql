ALTER TABLE identity_handles
  DROP CONSTRAINT IF EXISTS identity_handles_status_check,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD CONSTRAINT identity_handles_status_check CHECK (
    status IN ('proposed', 'confirmed', 'expired', 'revoked', 'deleted')
  );

UPDATE identity_handles
SET valid_until = created_at
  + CASE handle_type
      WHEN 'source_native_id' THEN interval '180 days'
      WHEN 'linkedin_url' THEN interval '730 days'
      WHEN 'public_profile_url' THEN interval '730 days'
      ELSE interval '365 days'
    END
WHERE status = 'confirmed'
  AND valid_until IS NULL;

CREATE INDEX identity_handles_freshness_expiry_idx
  ON identity_handles(valid_until, account_id, id)
  WHERE status = 'confirmed'
    AND valid_until IS NOT NULL;

CREATE TABLE identity_handle_lifecycle_events (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  identity_handle_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  source_resource_id uuid,
  actor_user_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('human', 'system')),
  event_type text NOT NULL CHECK (
    event_type IN ('confirmed', 'reconfirmed', 'expired', 'revoked')
  ),
  prior_status text CHECK (
    prior_status IS NULL
    OR prior_status IN (
      'proposed',
      'confirmed',
      'expired',
      'revoked',
      'deleted'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('proposed', 'confirmed', 'expired', 'revoked', 'deleted')
  ),
  reason text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, identity_handle_id)
    REFERENCES identity_handles(account_id, id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, source_resource_id)
    REFERENCES source_resources(account_id, id),
  FOREIGN KEY (account_id, actor_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX identity_handle_lifecycle_events_handle_idx
  ON identity_handle_lifecycle_events(
    account_id,
    identity_handle_id,
    created_at DESC
  );
