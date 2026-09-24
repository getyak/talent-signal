-- Normalized-email ownership, verified password signup, step-up credential
-- changes, and reviewed legacy-duplicate resolution (ADR 0018).
--
-- This migration never renames emails, merges accounts, re-parents rows, or
-- deletes records to make an index pass. Historical same-email accounts stay
-- accessible through their original credentials and are only reported and
-- reserved here.

-- users.email_verified_at records a real ownership proof (verified password
-- signup, or a provider assertion with a verified email claim). It is
-- provenance only: it never grants access to an existing account on its own.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- auth_identities.email_hint keeps the provider-observed account hint so
-- Settings can show it after authenticated verification. It is a hint, never
-- identity authority and never a token or secret.
ALTER TABLE auth_identities ADD COLUMN email_hint text;

-- ---------------------------------------------------------------------------
-- Normalized email reservations (trim + lowercase; no Gmail dot/plus/domain
-- collapsing and no Apple relay rewriting). The primary key is the durable
-- cross-provider arbiter: every real account creation claims its reservation in
-- the same transaction, so PostgreSQL decides concurrent password/Google/Apple
-- attempts for one normalized email.
-- ---------------------------------------------------------------------------
CREATE TABLE account_email_reservations (
  normalized_email text PRIMARY KEY CHECK (
    normalized_email = lower(btrim(normalized_email))
    AND normalized_email <> ''
    AND length(normalized_email) <= 320
  ),
  state text NOT NULL CHECK (state IN ('owned', 'conflict')),
  account_id uuid,
  user_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'owned') = (account_id IS NOT NULL AND user_id IS NOT NULL)),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Backfill. Exactly one existing real owner keeps its email; emails held by
-- more than one historical owner become explicit conflict reservations with a
-- NULL owner. Existing owners are not merged, renamed, or picked by age/size,
-- and each owner's authenticated access is preserved. (PostgreSQL has no
-- min(uuid); array aggregation picks the sole owner row when count is one.)
INSERT INTO account_email_reservations(normalized_email, state, account_id, user_id)
SELECT lower(btrim(u.email)),
       CASE WHEN count(*) > 1 THEN 'conflict' ELSE 'owned' END,
       CASE WHEN count(*) = 1 THEN (array_agg(u.account_id))[1] END,
       CASE WHEN count(*) = 1 THEN (array_agg(u.id))[1] END
FROM users u
WHERE u.kind IN ('password_human', 'google_human', 'apple_human')
GROUP BY lower(btrim(u.email));

-- Real accounts must hold the owned reservation for their normalized email
-- before a row can exist. This enforces the uniqueness rule at the database
-- boundary for every registration and linking path, and keeps membership
-- revocation from freeing an email or reviving an old credential.
CREATE FUNCTION enforce_account_email_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  normalized text := lower(btrim(NEW.email));
  owner record;
BEGIN
  IF NEW.kind IN ('password_human', 'google_human', 'apple_human') THEN
    SELECT state, account_id, user_id INTO owner
    FROM account_email_reservations
    WHERE normalized_email = normalized
      FOR SHARE;
    IF NOT FOUND
      OR owner.state <> 'owned'
      OR owner.account_id IS DISTINCT FROM NEW.account_id
      OR owner.user_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'ACCOUNT_EMAIL_RESERVATION_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_account_email_reservation
BEFORE INSERT OR UPDATE OF email, kind ON users
FOR EACH ROW EXECUTE FUNCTION enforce_account_email_reservation();

-- ---------------------------------------------------------------------------
-- Verified password signup. A pending registration is short-lived, stores only
-- a password hash and a verification-secret hash, and never reserves an email.
-- It therefore cannot block a verified provider signup for the same address.
-- ---------------------------------------------------------------------------
CREATE TABLE pending_password_registrations (
  id uuid PRIMARY KEY,
  normalized_email text NOT NULL CHECK (
    normalized_email = lower(btrim(normalized_email))
    AND normalized_email <> ''
    AND length(normalized_email) <= 320
  ),
  username text NOT NULL CHECK (username ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  password_scrypt text NOT NULL CHECK (
    password_scrypt ~ '^scrypt[$]v1[$][a-f0-9]{32,128}[$][a-f0-9]{128}$'
  ),
  verification_secret_hash text NOT NULL UNIQUE CHECK (
    verification_secret_hash ~ '^[a-f0-9]{64}$'
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pending_password_registrations_open_idx
  ON pending_password_registrations(expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX pending_password_registrations_email_idx
  ON pending_password_registrations(normalized_email, created_at);

CREATE INDEX pending_password_registrations_username_idx
  ON pending_password_registrations(lower(username), created_at);

-- ---------------------------------------------------------------------------
-- Step-up bound, single-use credential-change attempts. Each attempt is tied
-- to the authenticated account, user, and auth session that created it, to a
-- provider and intent, to the backend origin the browser saw, and to a nonce
-- and revision rechecked at commit. Only hashed opaque secrets are stored.
-- ---------------------------------------------------------------------------
CREATE TABLE credential_change_attempts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES sessions(id),
  intent text NOT NULL CHECK (
    intent IN ('link_provider', 'unlink_provider', 'set_password', 'change_password')
  ),
  provider text CHECK (provider IN ('apple', 'google', 'password')),
  origin text NOT NULL CHECK (length(origin) BETWEEN 1 AND 500),
  client_label text NOT NULL CHECK (length(client_label) BETWEEN 1 AND 80),
  attempt_secret_hash text NOT NULL UNIQUE CHECK (
    attempt_secret_hash ~ '^[a-f0-9]{64}$'
  ),
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^[a-f0-9]{64}$'),
  expected_revision integer NOT NULL CHECK (expected_revision > 0),
  expected_user_revision integer NOT NULL CHECK (expected_user_revision > 0),
  provider_challenge_id uuid,
  step_up_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (intent IN ('link_provider', 'unlink_provider'))
    = (provider IS NOT NULL)
  ),
  CHECK (NOT (intent = 'link_provider' AND provider = 'password')),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id)
);

CREATE INDEX credential_change_attempts_open_idx
  ON credential_change_attempts(account_id, user_id, expires_at)
  WHERE consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Reviewed historical-duplicate resolution. A reconciliation request carries a
-- frozen revision, a full classified emptiness inventory, and an idempotent
-- state machine. Non-empty duplicates stay review-required; there is no
-- generic account_id rewrite anywhere in this schema.
-- ---------------------------------------------------------------------------
CREATE TABLE account_reconciliation_requests (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_session_id uuid NOT NULL REFERENCES sessions(id),
  duplicate_account_id uuid NOT NULL,
  duplicate_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('empty_duplicate_transfer', 'review_required')
  ),
  state text NOT NULL CHECK (
    state IN ('prepared', 'confirmed', 'committed', 'cancelled')
  ),
  frozen_revision integer NOT NULL CHECK (frozen_revision > 0),
  -- Frozen dual-proof state: both parties' account/profile revisions and the
  -- proof descriptors captured at prepare. Confirm refuses any drift.
  frozen_state jsonb NOT NULL,
  inventory jsonb NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (duplicate_account_id, duplicate_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX account_reconciliation_requests_account_idx
  ON account_reconciliation_requests(account_id, created_at DESC);

-- Tombstone for a retired redundant login after an empty-duplicate transfer.
-- The alias records where the credential now lives; it is never reactivated.
CREATE TABLE retired_login_aliases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  canonical_account_id uuid NOT NULL,
  canonical_user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('apple', 'google', 'password')),
  subject_hash text,
  reconciliation_id uuid,
  retired_session_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (canonical_account_id, canonical_user_id)
    REFERENCES users(account_id, id),
  UNIQUE (account_id, user_id, provider)
);

-- ---------------------------------------------------------------------------
-- Account access audit kinds for the new credential-change and reconciliation
-- flows. Details keep identifiers and lifecycle revisions only.
-- ---------------------------------------------------------------------------
ALTER TABLE account_access_events DROP CONSTRAINT account_access_events_kind_check;
ALTER TABLE account_access_events ADD CONSTRAINT account_access_events_kind_check
  CHECK (kind IN (
    'profile', 'workspace', 'member', 'transfer', 'revoke_session', 'onboarding',
    'link_provider', 'unlink_provider', 'set_password', 'change_password',
    'reconciliation'
  ));

-- Persistent account active/retired state (ADR 0018 empty-duplicate
-- transfer). Retirement is set atomically with the reviewed transfer; every
-- governed write fences on the EXISTING accounts row, never on an absent
-- retirement row.
ALTER TABLE accounts ADD COLUMN retired_at timestamptz;

-- Common transaction fence. The trigger locks the existing accounts row FOR
-- SHARE (held through transaction commit) and verifies it is still active for
-- every touched *_account_id value, covering both OLD and NEW scopes on scope
-- changes. Reconciliation locks source and destination FOR UPDATE in stable
-- order, so it waits for in-flight writes and blocks admitted-but-late writes
-- with ACCOUNT_RETIRED instead of letting them add data to a retired account.
-- Application paths additionally call assert_account_active up front so the
-- common case fails cleanly before doing work. A missing accounts row is
-- reported by the inventory and rejected by the application helper.
CREATE FUNCTION enforce_account_retirement_fence() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text;
  scope_id uuid;
  retired timestamptz;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'UPDATE' THEN
      scope_id := (to_jsonb(OLD) ->> col)::uuid;
      IF scope_id IS NOT NULL THEN
        SELECT a.retired_at INTO retired FROM accounts a WHERE a.id = scope_id FOR SHARE;
        IF FOUND AND retired IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_RETIRED';
        END IF;
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      scope_id := (to_jsonb(NEW) ->> col)::uuid;
      IF scope_id IS NOT NULL THEN
        SELECT a.retired_at INTO retired FROM accounts a WHERE a.id = scope_id FOR SHARE;
        IF FOUND AND retired IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_RETIRED';
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$ DECLARE item record; args text; BEGIN
  FOR item IN
    SELECT c.table_name, string_agg(quote_literal(c.column_name), ',' ORDER BY c.column_name) AS args
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name LIKE '%account_id'
      AND c.table_name <> 'accounts'
    GROUP BY c.table_name
  LOOP
    EXECUTE format(
      'CREATE TRIGGER account_retirement_fence BEFORE INSERT OR UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION enforce_account_retirement_fence(%s)',
      item.table_name, item.args);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Lab cleanup/write classification. Unknown tables fail closed; every new
-- account-scoped table carries the Lab write guard.
-- ---------------------------------------------------------------------------
INSERT INTO lab_test_workspace_table_manifest(table_name, scope) VALUES
  ('account_email_reservations', 'account'),
  ('credential_change_attempts', 'account'),
  ('account_reconciliation_requests', 'account'),
  ('retired_login_aliases', 'account'),
  ('pending_password_registrations', 'global');

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['account_email_reservations',
    'credential_change_attempts', 'account_reconciliation_requests',
    'retired_login_aliases'] LOOP
    EXECUTE format('CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard()', item);
  END LOOP;
END $$;
