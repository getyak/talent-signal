-- SDK working context is a disposable derivative, never product Memory or authority.
CREATE TABLE harness_source_generations (
  account_id uuid PRIMARY KEY REFERENCES accounts(id),
  generation bigint NOT NULL DEFAULT 0
);
INSERT INTO harness_source_generations(account_id) SELECT id FROM accounts;

CREATE TABLE harness_sessions (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  product_session_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  sdk_session_id uuid NOT NULL,
  configuration_fingerprint text NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
  scope_fingerprint text NOT NULL CHECK (scope_fingerprint ~ '^[a-f0-9]{64}$'),
  source_generation bigint NOT NULL,
  committed_turns integer NOT NULL DEFAULT 0 CHECK (committed_turns>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  invalidated_at timestamptz,
  PRIMARY KEY (account_id,id),
  UNIQUE (sdk_session_id),
  FOREIGN KEY (account_id,product_session_id) REFERENCES agent_sessions(account_id,id),
  FOREIGN KEY (account_id,owner_user_id) REFERENCES users(account_id,id),
  CHECK (expires_at<=created_at+interval '7 days')
);
CREATE UNIQUE INDEX harness_sessions_current ON harness_sessions(account_id,product_session_id)
  WHERE invalidated_at IS NULL;
CREATE INDEX harness_sessions_expiry ON harness_sessions(expires_at) WHERE invalidated_at IS NULL;

CREATE TABLE harness_session_entries (
  account_id uuid NOT NULL,
  harness_session_id uuid NOT NULL,
  subpath text NOT NULL DEFAULT '',
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  entry_uuid text,
  body jsonb NOT NULL CHECK (jsonb_typeof(body)='object' AND octet_length(body::text)<=2097152),
  PRIMARY KEY (account_id,harness_session_id,ordinal),
  FOREIGN KEY (account_id,harness_session_id) REFERENCES harness_sessions(account_id,id) ON DELETE CASCADE,
  UNIQUE (account_id,harness_session_id,subpath,entry_uuid),
  CHECK (length(subpath)<=240 AND length(COALESCE(entry_uuid,''))<=200)
);

-- Conservative account-wide invalidation covers hidden source content in SDK
-- summaries/subagent copies as well as the visible product reply. New unrelated
-- sources do not invalidate a session; corrections, revocations and deletions do.
CREATE FUNCTION invalidate_harness_source_generation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' THEN owner:=OLD.account_id; ELSE owner:=NEW.account_id; END IF;
  INSERT INTO harness_source_generations(account_id,generation) VALUES(owner,1)
    ON CONFLICT(account_id) DO UPDATE SET generation=harness_source_generations.generation+1;
  UPDATE harness_sessions SET invalidated_at=clock_timestamp() WHERE account_id=owner AND invalidated_at IS NULL;
  DELETE FROM harness_session_entries WHERE account_id=owner;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER invalidate_harness_evidence AFTER UPDATE OR DELETE ON evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_retention AFTER UPDATE OR DELETE ON source_retention_receipts
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_capture AFTER UPDATE OR DELETE ON captures
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_resource AFTER UPDATE OR DELETE ON source_resources
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_person AFTER UPDATE OR DELETE ON subjects
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_context AFTER UPDATE OR DELETE ON assignments
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_snapshot AFTER UPDATE OF status OR DELETE ON knowledge_snapshots
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_screenshot AFTER UPDATE OF state,status,expires_at,capture_id,subject_id,assignment_id OR DELETE ON screenshot_contact_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_media AFTER UPDATE OR DELETE ON chat_media_assets
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_retracted_task AFTER INSERT ON agent_session_retracted_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();

CREATE FUNCTION invalidate_product_harness_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.expires_at<=clock_timestamp()
    OR OLD.payload->>'personID' IS DISTINCT FROM NEW.payload->>'personID'
    OR OLD.payload->>'relationshipContextID' IS DISTINCT FROM NEW.payload->>'relationshipContextID'
    OR NOT COALESCE((OLD.payload->'turns') <@ (NEW.payload->'turns'),false) THEN
    UPDATE harness_sessions SET invalidated_at=clock_timestamp()
      WHERE account_id=NEW.account_id AND product_session_id=NEW.id AND invalidated_at IS NULL;
    DELETE FROM harness_session_entries e USING harness_sessions s WHERE e.account_id=s.account_id
      AND e.harness_session_id=s.id AND s.account_id=NEW.account_id AND s.product_session_id=NEW.id;
  ELSE
    UPDATE harness_sessions SET expires_at=LEAST(expires_at,NEW.expires_at)
      WHERE account_id=NEW.account_id AND product_session_id=NEW.id AND invalidated_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_product_harness_session AFTER UPDATE OF payload,deleted_at,expires_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION invalidate_product_harness_session();
