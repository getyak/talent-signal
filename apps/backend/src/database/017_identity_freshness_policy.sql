CREATE TABLE identity_handle_freshness_policies (
  version text PRIMARY KEY,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  policy_document jsonb NOT NULL,
  max_override_days integer NOT NULL CHECK (
    max_override_days > 0
    AND max_override_days <= 1825
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    effective_until IS NULL
    OR effective_until > effective_from
  ),
  CHECK (jsonb_typeof(policy_document) = 'object')
);

CREATE UNIQUE INDEX identity_handle_freshness_one_open_policy_idx
  ON identity_handle_freshness_policies((effective_until IS NULL))
  WHERE effective_until IS NULL;

INSERT INTO identity_handle_freshness_policies(
  version,
  effective_from,
  effective_until,
  policy_document,
  max_override_days
)
VALUES (
  'identity-freshness-2026-08-07.v1',
  '2026-08-07T00:00:00.000Z',
  NULL,
  '{
    "description": "Initial review intervals. These are governance defaults, not validated acceptance or identity probabilities.",
    "default_validity_days": {
      "email": 365,
      "phone": 365,
      "wechat": 365,
      "linkedin_url": 730,
      "public_profile_url": 730,
      "source_native_id": 180
    }
  }'::jsonb,
  1825
);

ALTER TABLE identity_handles
  ADD COLUMN freshness_policy_version text,
  ADD COLUMN validity_basis text,
  ADD COLUMN validity_override_reason text;

UPDATE identity_handles
SET freshness_policy_version = 'identity-freshness-2026-08-07.v1',
    validity_basis = 'legacy_migration';

ALTER TABLE identity_handles
  ALTER COLUMN freshness_policy_version SET NOT NULL,
  ALTER COLUMN validity_basis SET NOT NULL,
  ADD CONSTRAINT identity_handles_freshness_policy_fk
    FOREIGN KEY (freshness_policy_version)
    REFERENCES identity_handle_freshness_policies(version),
  ADD CONSTRAINT identity_handles_validity_basis_check CHECK (
    validity_basis IN (
      'policy_default',
      'human_override',
      'legacy_migration'
    )
  ),
  ADD CONSTRAINT identity_handles_override_reason_check CHECK (
    (
      validity_basis = 'human_override'
      AND NULLIF(btrim(validity_override_reason), '') IS NOT NULL
    )
    OR (
      validity_basis <> 'human_override'
      AND validity_override_reason IS NULL
    )
  );

ALTER TABLE identity_handle_lifecycle_events
  ADD COLUMN freshness_policy_version text,
  ADD COLUMN validity_basis text,
  ADD COLUMN validity_override_reason text;

UPDATE identity_handle_lifecycle_events
SET freshness_policy_version = 'identity-freshness-2026-08-07.v1',
    validity_basis = 'legacy_migration';

ALTER TABLE identity_handle_lifecycle_events
  ALTER COLUMN freshness_policy_version SET NOT NULL,
  ALTER COLUMN validity_basis SET NOT NULL,
  ADD CONSTRAINT identity_handle_lifecycle_freshness_policy_fk
    FOREIGN KEY (freshness_policy_version)
    REFERENCES identity_handle_freshness_policies(version),
  ADD CONSTRAINT identity_handle_lifecycle_validity_basis_check CHECK (
    validity_basis IN (
      'policy_default',
      'human_override',
      'legacy_migration'
    )
  ),
  ADD CONSTRAINT identity_handle_lifecycle_override_reason_check CHECK (
    (
      validity_basis = 'human_override'
      AND NULLIF(btrim(validity_override_reason), '') IS NOT NULL
    )
    OR (
      validity_basis <> 'human_override'
      AND validity_override_reason IS NULL
    )
  );
