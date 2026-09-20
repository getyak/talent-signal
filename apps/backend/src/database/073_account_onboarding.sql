-- Durable, per-user onboarding state for the account-owning human. These are
-- additive columns on users on purpose: onboarding is a property of the
-- authenticated user, not a candidate/contact record.
ALTER TABLE users ADD COLUMN onboarding_status text NOT NULL DEFAULT 'pending'
  CHECK (onboarding_status IN ('pending', 'completed', 'skipped'));
ALTER TABLE users ADD COLUMN onboarding_focus text NOT NULL DEFAULT ''
  CHECK (char_length(onboarding_focus) <= 280);
ALTER TABLE users ADD COLUMN onboarding_profile_url text NOT NULL DEFAULT ''
  CHECK (char_length(onboarding_profile_url) <= 2000);
-- A saved profile URL is a public HTTPS profile or empty. Private/local
-- targets are rejected before persistence; this is a defense-in-depth floor.
ALTER TABLE users ADD CONSTRAINT users_onboarding_profile_url_public_https
  CHECK (
    onboarding_profile_url = ''
    OR onboarding_profile_url ~ '^https://[^[:space:]]+$'
  );

-- Onboarding mutations reuse the existing account-scoped idempotency/audit
-- trail. The new kind carries revision and status only, never names or URLs.
ALTER TABLE account_access_events DROP CONSTRAINT account_access_events_kind_check;
ALTER TABLE account_access_events ADD CONSTRAINT account_access_events_kind_check
  CHECK (kind IN ('profile', 'workspace', 'member', 'transfer', 'revoke_session', 'onboarding'));
