-- MCP Extensions.
--
-- Inbound: an account-scoped record of an external MCP server that Talent
-- Signal may connect to as a client. The bearer credential is stored only as
-- an AES-256-GCM ciphertext produced with TALENT_SIGNAL_MCP_ENCRYPTION_KEY.
-- A saved URL is not a connection: status only becomes 'verified' after a real
-- initialize/initialized/tools-list handshake.
--
-- Outbound: scoped, read-only client grants. The random token is stored only
-- as a SHA-256 hash so a database read cannot recover it. The grant owner is
-- the workspace account and the member who created it.
CREATE TABLE mcp_connections (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  friendly_name text NOT NULL
    CHECK (char_length(friendly_name) BETWEEN 1 AND 80),
  server_url text NOT NULL
    CHECK (char_length(server_url) BETWEEN 1 AND 2048),
  -- Null when no bearer secret is configured. Never returned to a client.
  credential_ciphertext text
    CHECK (credential_ciphertext IS NULL OR char_length(credential_ciphertext) <= 8192),
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','verified','failed','unauthorized')),
  last_checked_at timestamptz,
  last_error_code text
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 80),
  last_error_message text
    CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 240),
  -- Inert discovery output: a bounded list of {name, description, read_only}.
  discovered_tools jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      CASE WHEN jsonb_typeof(discovered_tools) = 'array'
        THEN jsonb_array_length(discovered_tools) <= 100
          AND octet_length(discovered_tools::text) <= 262144
        ELSE false
      END
    ),
  tools_count integer NOT NULL DEFAULT 0
    CHECK (tools_count BETWEEN 0 AND 100),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, id, created_by_user_id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id,id)
);
CREATE INDEX mcp_connections_account_idx
  ON mcp_connections(account_id, created_at DESC, id);

CREATE TABLE mcp_client_grants (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- Only the hash is stored. The raw token is revealed once at creation.
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text NOT NULL CHECK (char_length(token_hint) BETWEEN 4 AND 32),
  scopes text[] NOT NULL
    CHECK (
      array_length(scopes, 1) BETWEEN 1 AND 2
      AND scopes <@ ARRAY['workspace_metadata_read','people_directory_read']::text[]
    ),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  creation_idempotency_key uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, id),
  UNIQUE (token_hash),
  UNIQUE (account_id, created_by_user_id, creation_idempotency_key),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id,id),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '30 days')
);
CREATE INDEX mcp_client_grants_token_idx
  ON mcp_client_grants(token_hash)
  WHERE revoked_at IS NULL;
CREATE INDEX mcp_client_grants_account_idx
  ON mcp_client_grants(account_id, created_at DESC, id);

INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES
  ('mcp_connections','account'),
  ('mcp_client_grants','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON mcp_connections
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON mcp_client_grants
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
