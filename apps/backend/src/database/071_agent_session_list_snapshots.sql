-- Short-lived identity-only snapshots keep Session pagination complete and
-- ordered while concurrent mutations continue to update canonical rows.
CREATE INDEX agent_sessions_owner_recency_idx
  ON agent_sessions(account_id,created_by_user_id,updated_at DESC,id DESC);

CREATE TABLE agent_session_list_snapshots (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,id),
  FOREIGN KEY (account_id,created_by_user_id) REFERENCES users(account_id,id),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '10 minutes')
);
CREATE INDEX agent_session_list_snapshots_expiry_idx
  ON agent_session_list_snapshots(expires_at);
CREATE INDEX agent_session_list_snapshots_owner_idx
  ON agent_session_list_snapshots(
    account_id,created_by_user_id,created_at DESC,id DESC
  );

CREATE TABLE agent_session_list_snapshot_items (
  account_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  session_id uuid NOT NULL,
  sort_updated_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,snapshot_id,session_id),
  FOREIGN KEY (account_id,snapshot_id)
    REFERENCES agent_session_list_snapshots(account_id,id) ON DELETE CASCADE,
  FOREIGN KEY (account_id,session_id)
    REFERENCES agent_sessions(account_id,id) ON DELETE CASCADE
);
CREATE INDEX agent_session_list_snapshot_items_page_idx
  ON agent_session_list_snapshot_items(
    account_id,snapshot_id,sort_updated_at DESC,session_id DESC
  );

INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES
  ('agent_session_list_snapshots','account'),
  ('agent_session_list_snapshot_items','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON agent_session_list_snapshots
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON agent_session_list_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
