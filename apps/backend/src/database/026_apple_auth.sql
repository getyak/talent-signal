ALTER TABLE users DROP CONSTRAINT users_kind_check;
ALTER TABLE users
  ADD CONSTRAINT users_kind_check
  CHECK (kind IN ('simulated_human', 'apple_human'));

CREATE TABLE apple_login_challenges (
  id uuid PRIMARY KEY,
  expected_nonce_hash text NOT NULL,
  client_label text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX apple_login_challenges_open_idx
  ON apple_login_challenges(expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'apple'),
  subject_hash text NOT NULL,
  last_authenticated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject_hash),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
);

CREATE INDEX auth_identities_account_user_idx
  ON auth_identities(account_id, user_id);

CREATE TABLE consumed_auth_assertions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider = 'apple'),
  assertion_hash text NOT NULL UNIQUE,
  challenge_id uuid NOT NULL REFERENCES apple_login_challenges(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
