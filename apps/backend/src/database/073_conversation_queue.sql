-- Durable conversation queue: admission commits here before any model work.
-- Rows inherit Session ownership and the thirty-day Session lifetime. The
-- queue never retains a raw token log: live preview lives in runner memory
-- only. The produced result is held just long enough to replay canonical
-- Session persistence (including a lineage/audit boundary) without a second
-- model call, then scrubbed on terminal success or cancellation.
--
-- `objective` is the user's own pending intention, not evidence. Terminal
-- states the user cannot retry are replaced with a privacy-safe tombstone
-- (`content_state='scrubbed'`): objective, stage and result are cleared so no
-- invisible copy survives canonical Session persistence. A
-- `failure_code='PERSISTENCE_PENDING'` row deliberately keeps its result so an
-- explicit retry or lease recovery replays persistence instead of the model.
CREATE TABLE conversation_queue_entries (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  id uuid NOT NULL,
  message_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  auth_session_id uuid,
  sequence bigint NOT NULL CHECK (sequence > 0),
  status text NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled','interrupted')),
  content_state text NOT NULL DEFAULT 'retained' CHECK (content_state IN ('retained','scrubbed')),
  objective text CHECK (objective IS NULL OR length(objective) BETWEEN 1 AND 1000),
  time_zone text CHECK (time_zone IS NULL OR length(time_zone) <= 100),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  run_id uuid,
  lease_owner text CHECK (lease_owner IS NULL OR length(lease_owner) <= 120),
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  lease_expires_at timestamptz,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  stage text CHECK (stage IS NULL OR length(stage) <= 40),
  cancel_requested boolean NOT NULL DEFAULT false,
  failure_code text CHECK (failure_code IS NULL OR length(failure_code) <= 80),
  result jsonb CHECK (result IS NULL OR octet_length(result::text) <= 131072),
  result_recorded_at timestamptz,
  lineage_recorded_at timestamptz,
  persisted_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, session_id, message_id),
  FOREIGN KEY (account_id, session_id) REFERENCES agent_sessions(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id, id),
  CHECK (expires_at <= created_at + interval '30 days'),
  CHECK ((status = 'running') OR lease_owner IS NULL),
  CHECK (NOT cancel_requested OR status = 'running'),
  CHECK (
    (content_state = 'scrubbed' AND objective IS NULL AND stage IS NULL AND result IS NULL)
    OR (content_state = 'retained' AND objective IS NOT NULL)
  )
);
CREATE INDEX conversation_queue_session_idx ON conversation_queue_entries(account_id, session_id, sequence);
CREATE INDEX conversation_queue_runnable_idx ON conversation_queue_entries(status, updated_at)
  WHERE status IN ('queued','running');
CREATE INDEX conversation_queue_expiry_idx ON conversation_queue_entries(expires_at);

-- One queue state row per Session carries the monotonic observation revision,
-- the client-visible pause flag, and the next FIFO sequence.
CREATE TABLE conversation_queue_state (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  paused boolean NOT NULL DEFAULT false,
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, session_id),
  FOREIGN KEY (account_id, session_id) REFERENCES agent_sessions(account_id, id) ON DELETE CASCADE
);

-- Replayed queue mutations must return their original receipt instead of a
-- misleading revision conflict after the first attempt succeeded. Only the
-- privacy-safe applied receipt is stored, never a snapshot with objectives.
CREATE TABLE conversation_queue_operations (
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash text NOT NULL,
  applied jsonb NOT NULL CHECK (octet_length(applied::text) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, actor_user_id, idempotency_key),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id, id)
);

-- Test workspaces fail closed whenever a new table is not explicitly covered.
INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES
  ('conversation_queue_entries','account'),
  ('conversation_queue_state','account'),
  ('conversation_queue_operations','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON conversation_queue_entries
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON conversation_queue_state
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON conversation_queue_operations
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
