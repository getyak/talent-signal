ALTER TABLE users DROP CONSTRAINT users_kind_check;
ALTER TABLE users ADD CONSTRAINT users_kind_check
  CHECK (kind IN ('simulated_human', 'apple_human', 'password_human', 'lab_human'));

-- These control records contain identities and receipts, never copied business data
-- or raw bearer credentials. They survive deletion of the isolated test data.
CREATE TABLE lab_test_workspaces (
  id uuid PRIMARY KEY,
  owner_account_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  target_account_id uuid NOT NULL UNIQUE REFERENCES accounts(id),
  target_user_id uuid NOT NULL UNIQUE,
  duration_hours integer NOT NULL CHECK (duration_hours IN (1,4,24)),
  created_at timestamptz NOT NULL DEFAULT now(),
  empty_verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','deleting','deleted')),
  stop_id uuid,
  stop_reason text CHECK (stop_reason IN ('manual','expired')),
  stopped_at timestamptz,
  deleted_at timestamptz,
  media_scope_hash text NOT NULL CHECK (media_scope_hash ~ '^[a-f0-9]{64}$'),
  media_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media_manifest) = 'array'),
  cleanup_error text CHECK (cleanup_error IN ('schema_changed','media_scope_changed','media_unsettled','media_cleanup_failed','data_cleanup_failed')),
  FOREIGN KEY(owner_account_id,owner_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY(target_account_id,target_user_id) REFERENCES users(account_id,id),
  CHECK (owner_account_id <> target_account_id),
  CHECK ((state = 'active' AND stop_id IS NULL AND stopped_at IS NULL AND deleted_at IS NULL)
    OR (state = 'deleting' AND stop_id IS NOT NULL AND stopped_at IS NOT NULL AND deleted_at IS NULL)
    OR (state = 'deleted' AND stop_id IS NOT NULL AND stopped_at IS NOT NULL AND deleted_at IS NOT NULL))
);
CREATE INDEX lab_test_workspaces_owner ON lab_test_workspaces(owner_account_id,owner_user_id,created_at DESC);
CREATE INDEX lab_test_workspaces_cleanup ON lab_test_workspaces(state,expires_at) WHERE state <> 'deleted';

CREATE TABLE lab_test_workspace_entries (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lab_test_workspaces(id),
  owner_session_id uuid NOT NULL,
  session_id uuid NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX lab_test_workspace_entries_workspace ON lab_test_workspace_entries(workspace_id,created_at DESC);

-- A committed marker precedes each object PUT. An ambiguous remote PUT remains
-- visible after a crash and prevents a false deletion receipt.
CREATE TABLE lab_test_workspace_media_writes (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lab_test_workspaces(id),
  media_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  state text NOT NULL DEFAULT 'started' CHECK (state IN ('started','settled','unknown'))
);
CREATE INDEX lab_test_workspace_media_pending ON lab_test_workspace_media_writes(workspace_id,state);

-- New tables must be deliberately classified by their migration before this
-- feature can create or delete data under a changed schema.
CREATE TABLE lab_test_workspace_table_manifest (
  table_name text PRIMARY KEY CHECK (table_name ~ '^[a-z][a-z0-9_]*$'),
  scope text NOT NULL CHECK (scope IN ('account','cascade','control','global'))
);
INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
SELECT t.table_name, CASE
  WHEN t.table_name IN ('accounts','users','sessions','lab_test_workspaces',
    'lab_test_workspace_entries','lab_test_workspace_media_writes','lab_test_workspace_table_manifest') THEN 'control'
  WHEN t.table_name = 'lab_experiment_attempts' THEN 'cascade'
  WHEN EXISTS (SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'account_id') THEN 'account'
  WHEN t.table_name IN ('apple_login_challenges','consumed_auth_assertions',
    'identity_handle_freshness_policies','schema_migrations') THEN 'global'
  ELSE NULL END
FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';

CREATE FUNCTION lab_test_workspace_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id uuid; workspace record;
BEGIN
  -- Check both sides of any account change. Moving closed test data out of its
  -- scope must not bypass cleanup ownership.
  FOR scope_id IN SELECT DISTINCT x FROM unnest(
    CASE WHEN TG_OP = 'UPDATE' THEN ARRAY[OLD.account_id,NEW.account_id]
    ELSE ARRAY[NEW.account_id] END) AS x
  LOOP
    SELECT state,expires_at INTO workspace FROM lab_test_workspaces
      WHERE target_account_id = scope_id FOR SHARE;
    IF FOUND AND (workspace.state <> 'active' OR workspace.expires_at <= clock_timestamp()) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LAB_TEST_WORKSPACE_CLOSED';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT table_name FROM lab_test_workspace_table_manifest WHERE scope = 'account' LOOP
    EXECUTE format('CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard()', item.table_name);
  END LOOP;
END $$;
