ALTER TABLE users DROP CONSTRAINT users_kind_check;
ALTER TABLE users ADD CONSTRAINT users_kind_check
  CHECK (kind IN ('simulated_human', 'apple_human', 'password_human', 'lab_human', 'google_human'));

ALTER TABLE auth_identities DROP CONSTRAINT auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check
  CHECK (provider IN ('apple', 'google'));

CREATE TABLE google_login_challenges (
  id uuid PRIMARY KEY,
  expected_nonce_hash text NOT NULL,
  client_label text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE google_consumed_assertions (
  assertion_hash text PRIMARY KEY,
  challenge_id uuid NOT NULL UNIQUE REFERENCES google_login_challenges(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX google_challenge_expiry ON google_login_challenges(expires_at);
CREATE INDEX google_assertion_expiry ON google_consumed_assertions(expires_at);
