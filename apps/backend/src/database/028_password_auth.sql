ALTER TABLE users DROP CONSTRAINT users_kind_check;
ALTER TABLE users
  ADD CONSTRAINT users_kind_check
  CHECK (kind IN ('simulated_human', 'apple_human', 'password_human'));

ALTER TABLE users
  ADD COLUMN username text,
  ADD COLUMN account_role text NOT NULL DEFAULT 'member'
    CHECK (account_role IN ('admin', 'member'));

ALTER TABLE users
  ADD CONSTRAINT users_username_format_check
  CHECK (
    username IS NULL OR username ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$'
  );

CREATE UNIQUE INDEX users_password_username_unique_idx
  ON users(lower(username))
  WHERE username IS NOT NULL AND kind = 'password_human';

CREATE UNIQUE INDEX users_password_email_unique_idx
  ON users(lower(email))
  WHERE kind = 'password_human';

CREATE TABLE password_credentials (
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  password_scrypt text NOT NULL CHECK (
    password_scrypt ~ '^scrypt\\$v1\\$[a-f0-9]{32,128}\\$[a-f0-9]{128}$'
  ),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
);

CREATE INDEX password_credentials_locked_idx
  ON password_credentials(locked_until)
  WHERE locked_until IS NOT NULL;
