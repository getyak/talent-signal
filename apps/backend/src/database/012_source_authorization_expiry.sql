ALTER TABLE source_retention_receipts
  DROP CONSTRAINT IF EXISTS source_retention_receipts_authorization_state_check,
  DROP CONSTRAINT IF EXISTS source_retention_receipts_authorization_reason_check,
  ADD COLUMN authorization_expires_at timestamptz,
  ADD CONSTRAINT source_retention_receipts_authorization_state_check
    CHECK (authorization_state IN ('authorized', 'revoked', 'expired')),
  ADD CONSTRAINT source_retention_receipts_authorization_reason_check
    CHECK (
      authorization_reason IN (
        'capture_authorized',
        'recruiter_revoked',
        'recruiter_restored',
        'authorization_expired'
      )
    );

CREATE INDEX source_authorization_expiry_idx
  ON source_retention_receipts(
    authorization_expires_at,
    account_id,
    capture_id
  )
  WHERE authorization_state = 'authorized'
    AND authorization_expires_at IS NOT NULL;

ALTER TABLE source_authorization_decisions
  DROP CONSTRAINT IF EXISTS source_authorization_decisions_decision_check,
  DROP CONSTRAINT IF EXISTS source_authorization_decisions_prior_authorization_state_check,
  DROP CONSTRAINT IF EXISTS source_authorization_decisions_authorization_state_check,
  ALTER COLUMN decided_by_user_id DROP NOT NULL,
  ADD COLUMN transition_actor text NOT NULL DEFAULT 'human'
    CHECK (transition_actor IN ('human', 'system')),
  ADD COLUMN authorization_expires_at timestamptz,
  ADD COLUMN external_effects_requiring_follow_up integer NOT NULL DEFAULT 0
    CHECK (external_effects_requiring_follow_up >= 0),
  ADD CONSTRAINT source_authorization_decisions_decision_check
    CHECK (decision IN ('revoke', 'restore', 'expire')),
  ADD CONSTRAINT source_authorization_decisions_prior_authorization_state_check
    CHECK (
      prior_authorization_state IN ('authorized', 'revoked', 'expired')
    ),
  ADD CONSTRAINT source_authorization_decisions_authorization_state_check
    CHECK (authorization_state IN ('authorized', 'revoked', 'expired'));
