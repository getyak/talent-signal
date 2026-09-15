-- Meeting drafts are account- and user-scoped projections of a CalendarDraft
-- value produced by a session-bound chat task. They are reviewable proposals:
-- external_effect is always 'none'. A draft is never a confirmed calendar event,
-- an invitation, or an execution receipt.
--
-- Every draft is bound to the originating Agent Session and chat task, and it
-- expires no later than that Session/task. When the source is revoked,
-- deleted, expired, or otherwise unavailable, the sensitive draft content is
-- redacted while a non-sensitive tombstone/status remains for auditable reads.
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_meeting_draft_owner_unique
  UNIQUE (account_id,id,created_by_user_id);
ALTER TABLE agent_session_chat_tasks ADD CONSTRAINT agent_session_chat_tasks_meeting_draft_source_unique
  UNIQUE (account_id,task_id,actor_user_id,origin_session_id);

CREATE TABLE meeting_drafts (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  source_task_id text NOT NULL,
  origin_session_id uuid NOT NULL,
  source_message_id text,
  -- Sensitive content. Null after redaction; the tombstone columns below stay.
  title text,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  source_excerpt text,
  reference_time timestamptz,
  status text NOT NULL CHECK (status IN ('needs_review','dismissed','expired','redacted')),
  external_effect text NOT NULL CHECK (external_effect = 'none'),
  revision integer NOT NULL CHECK (revision > 0),
  -- Use wall-clock insertion time rather than transaction-start `now()` and
  -- keep it immutable: materialized list snapshots retain this exact sort key
  -- across every page even when older transactions commit later.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  redacted_at timestamptz,
  dismissed_at timestamptz,
  dismiss_idempotency_key uuid,
  edit_idempotency_key uuid,
  edit_request_hash text,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, source_task_id),
  UNIQUE (account_id, id, created_by_user_id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id, origin_session_id) REFERENCES agent_sessions(account_id,id),
  FOREIGN KEY (account_id, source_task_id) REFERENCES agent_session_chat_tasks(account_id,task_id),
  FOREIGN KEY (account_id, origin_session_id, created_by_user_id)
    REFERENCES agent_sessions(account_id,id,created_by_user_id),
  FOREIGN KEY (account_id, source_task_id, created_by_user_id, origin_session_id)
    REFERENCES agent_session_chat_tasks(account_id,task_id,actor_user_id,origin_session_id),
  -- A redacted or expired draft keeps identity and status but never sensitive content.
  -- Dismissal is a normal user transition and retains the reviewed content.
  CHECK (
    (status IN ('redacted','expired') AND redacted_at IS NOT NULL
      AND title IS NULL AND starts_at IS NULL AND ends_at IS NULL
      AND time_zone IS NULL AND source_excerpt IS NULL AND reference_time IS NULL)
    OR
    (status IN ('needs_review','dismissed') AND redacted_at IS NULL
      AND title IS NOT NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL
      AND time_zone IS NOT NULL AND source_excerpt IS NOT NULL AND reference_time IS NOT NULL)
  ),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL),
  CHECK (status <> 'needs_review' OR dismissed_at IS NULL),
  CHECK ((status = 'dismissed') = (dismiss_idempotency_key IS NOT NULL)),
  CHECK ((edit_idempotency_key IS NULL) = (edit_request_hash IS NULL)),
  CHECK (edit_request_hash IS NULL OR edit_request_hash ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at > created_at),
  CHECK (
    status IN ('redacted','expired')
    OR (ends_at > starts_at AND ends_at - starts_at <= interval '7 days')
  ),
  CHECK (title IS NULL OR btrim(title) <> ''),
  CHECK (time_zone IS NULL OR btrim(time_zone) <> ''),
  CHECK (source_excerpt IS NULL OR btrim(source_excerpt) <> ''),
  CHECK (char_length(title) <= 200),
  CHECK (char_length(time_zone) <= 100),
  CHECK (char_length(source_excerpt) <= 1000)
);
CREATE INDEX meeting_drafts_owner_idx ON meeting_drafts(account_id,created_by_user_id,created_at,id);
CREATE INDEX meeting_drafts_task_idx ON meeting_drafts(account_id,source_task_id);
CREATE INDEX meeting_drafts_expiry_idx ON meeting_drafts(expires_at) WHERE status = 'needs_review';

CREATE FUNCTION meeting_draft_created_at_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'MEETING_DRAFT_CREATED_AT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER meeting_draft_created_at_immutable
  BEFORE UPDATE OF created_at ON meeting_drafts
  FOR EACH ROW EXECUTE FUNCTION meeting_draft_created_at_immutable();

-- Durable, non-sensitive operation receipts bind one account/user operation
-- identity to one exact draft intent. This prevents the same UUID from
-- mutating two drafts or being replayed with a changed expected revision.
CREATE TABLE meeting_draft_operations (
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  draft_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('edit','dismiss')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response_revision integer NOT NULL CHECK (response_revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id,actor_user_id,idempotency_key),
  FOREIGN KEY (account_id,actor_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id,draft_id) REFERENCES meeting_drafts(account_id,id),
  FOREIGN KEY (account_id,draft_id,actor_user_id)
    REFERENCES meeting_drafts(account_id,id,created_by_user_id)
);
CREATE INDEX meeting_draft_operations_draft_idx
  ON meeting_draft_operations(account_id,draft_id,created_at);

-- Short-lived list snapshots materialize only draft identities and immutable
-- ordering keys. This makes multi-request pagination complete even when a
-- transaction that started before the first page commits afterwards with an
-- older created_at value. Sensitive draft content remains in meeting_drafts
-- and is re-authorized on every page read.
CREATE TABLE meeting_draft_list_snapshots (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('all','reviewable','inactive')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,id),
  FOREIGN KEY (account_id,created_by_user_id) REFERENCES users(account_id,id),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '10 minutes')
);
CREATE INDEX meeting_draft_list_snapshots_expiry_idx
  ON meeting_draft_list_snapshots(expires_at);

CREATE TABLE meeting_draft_list_snapshot_items (
  account_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  sort_created_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,snapshot_id,draft_id),
  FOREIGN KEY (account_id,snapshot_id)
    REFERENCES meeting_draft_list_snapshots(account_id,id) ON DELETE CASCADE,
  FOREIGN KEY (account_id,draft_id)
    REFERENCES meeting_drafts(account_id,id) ON DELETE CASCADE
);
CREATE INDEX meeting_draft_list_snapshot_items_page_idx
  ON meeting_draft_list_snapshot_items(
    account_id,snapshot_id,sort_created_at DESC,draft_id DESC
  );

-- A draft is available only while its originating Session and chat task are
-- current. Reads never expose a draft whose authority was withdrawn.
CREATE FUNCTION meeting_draft_source_available(account uuid, origin_session uuid, source_task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT agent_session_chat_sources_available(account,source_task)
    AND EXISTS (SELECT 1 FROM agent_session_chat_tasks t
      WHERE t.account_id=account AND t.task_id=canonical_agent_session_id(source_task)
        AND t.origin_session_id=origin_session
        AND t.expires_at>statement_timestamp())
    AND EXISTS (SELECT 1 FROM agent_sessions s
      WHERE s.account_id=account AND s.id=origin_session
        AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp())
$$;

-- Redact every draft for one account whose source is no longer available or
-- whose retention lapsed. Sensitive columns are nulled and the status becomes
-- a non-sensitive tombstone: 'expired' when retention lapsed, otherwise
-- 'redacted' (source deleted, withdrawn, revoked, or unavailable).
CREATE FUNCTION redact_unavailable_meeting_drafts(account uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  WITH redacted AS (
    UPDATE meeting_drafts d SET
      title=NULL, starts_at=NULL, ends_at=NULL, time_zone=NULL,
      source_excerpt=NULL, reference_time=NULL,
      dismiss_idempotency_key=NULL,
      edit_idempotency_key=NULL, edit_request_hash=NULL,
      status='expired', redacted_at=COALESCE(d.redacted_at,clock_timestamp()),
      updated_at=clock_timestamp(), revision=d.revision+1
    WHERE d.account_id=account AND d.status NOT IN ('redacted','expired')
      AND d.expires_at<=statement_timestamp()
    RETURNING d.account_id,d.id
  )
  DELETE FROM meeting_draft_operations operation
  USING redacted
  WHERE operation.account_id=redacted.account_id
    AND operation.draft_id=redacted.id;
  WITH redacted AS (
    UPDATE meeting_drafts d SET
      title=NULL, starts_at=NULL, ends_at=NULL, time_zone=NULL,
      source_excerpt=NULL, reference_time=NULL,
      dismiss_idempotency_key=NULL,
      edit_idempotency_key=NULL, edit_request_hash=NULL,
      status='redacted', redacted_at=COALESCE(d.redacted_at,clock_timestamp()),
      updated_at=clock_timestamp(), revision=d.revision+1
    WHERE d.account_id=account AND d.status NOT IN ('redacted','expired')
      AND NOT meeting_draft_source_available(account,d.origin_session_id,d.source_task_id)
    RETURNING d.account_id,d.id
  )
  DELETE FROM meeting_draft_operations operation
  USING redacted
  WHERE operation.account_id=redacted.account_id
    AND operation.draft_id=redacted.id;
END;
$$;

-- A source transition redacts drafts in the same transaction. The trigger only
-- needs the changed account; the helper re-checks every affected draft.
CREATE FUNCTION invalidate_meeting_draft_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM redact_unavailable_meeting_drafts(NEW.account_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER invalidate_meeting_draft_session AFTER UPDATE OF deleted_at,expires_at,payload ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION invalidate_meeting_draft_sources();
CREATE TRIGGER invalidate_meeting_draft_chat_task AFTER UPDATE OF expires_at ON agent_session_chat_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_meeting_draft_sources();

-- The existing source lifecycle records every withdrawn task here. A trigger
-- extends that stable boundary without replacing the lifecycle functions from
-- migration 056 (and therefore cannot freeze an older copy of their logic).
CREATE TRIGGER invalidate_meeting_draft_retracted_task
  AFTER INSERT ON agent_session_retracted_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_meeting_draft_sources();

-- Record drafts once. A retry with the same draft identity returns the stored
-- row instead of inserting a duplicate; the caller asserts the draft belongs to
-- the same account, user, Session, and chat task.
CREATE FUNCTION record_meeting_draft(
  p_account uuid,
  p_id uuid,
  p_user uuid,
  p_task text,
  p_session uuid,
  p_message text,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_time_zone text,
  p_source_excerpt text,
  p_reference_time timestamptz,
  p_expires_at timestamptz
) RETURNS meeting_drafts LANGUAGE plpgsql AS $$
DECLARE
  existing meeting_drafts;
  inserted meeting_drafts;
  inserted_at timestamptz;
  source_expires_at timestamptz;
BEGIN
  SELECT LEAST(t.expires_at,s.expires_at) INTO source_expires_at
  FROM agent_session_chat_tasks t
  JOIN agent_sessions s
    ON s.account_id=t.account_id AND s.id=t.origin_session_id
  WHERE t.account_id=p_account
    AND t.task_id=canonical_agent_session_id(p_task)
    AND t.actor_user_id=p_user
    AND t.origin_session_id=p_session
    AND s.created_by_user_id=p_user
    AND s.payload IS NOT NULL
    AND t.expires_at>statement_timestamp()
    AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()
    AND agent_session_chat_sources_available(t.account_id,t.task_id)
  FOR SHARE OF t,s;
  IF NOT FOUND
    OR p_expires_at<=clock_timestamp()
    OR p_expires_at>source_expires_at
    OR p_expires_at>clock_timestamp()+interval '30 days' THEN
    RAISE EXCEPTION 'MEETING_DRAFT_SOURCE_AUTHORITY_INVALID';
  END IF;
  SELECT * INTO existing FROM meeting_drafts d
    WHERE d.account_id=p_account AND d.id=p_id FOR UPDATE;
  IF FOUND THEN
    IF existing.created_by_user_id<>p_user
      OR existing.source_task_id<>canonical_agent_session_id(p_task)
      OR existing.origin_session_id<>p_session THEN
      RAISE EXCEPTION 'MEETING_DRAFT_IDENTITY_CONFLICT';
    END IF;
    RETURN existing;
  END IF;
  SELECT * INTO existing FROM meeting_drafts d
    WHERE d.account_id=p_account AND d.source_task_id=canonical_agent_session_id(p_task)
    FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'MEETING_DRAFT_TASK_CONFLICT';
  END IF;
  inserted_at := clock_timestamp();
  INSERT INTO meeting_drafts(account_id,id,created_by_user_id,source_task_id,origin_session_id,
    source_message_id,title,starts_at,ends_at,time_zone,source_excerpt,reference_time,
    status,external_effect,revision,created_at,updated_at,expires_at)
  VALUES (p_account,p_id,p_user,canonical_agent_session_id(p_task),p_session,
    p_message,p_title,p_starts_at,p_ends_at,p_time_zone,p_source_excerpt,p_reference_time,
    'needs_review','none',1,inserted_at,inserted_at,p_expires_at)
  RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

-- Backfill still-retained Session answers created before this projection was
-- introduced. Only complete, safe CalendarDraft values with current source
-- authority are admitted; redacted idempotency responses have no blocks and
-- are therefore skipped.
INSERT INTO meeting_drafts(
  account_id,id,created_by_user_id,source_task_id,origin_session_id,
  source_message_id,title,starts_at,ends_at,time_zone,source_excerpt,
  reference_time,status,external_effect,revision,created_at,updated_at,expires_at
)
SELECT DISTINCT ON (i.account_id,t.task_id)
  i.account_id,(draft.value->>'id')::uuid,i.actor_user_id,t.task_id,
  t.origin_session_id,NULL,draft.value->>'title',
  parsed.starts_at,parsed.ends_at,
  draft.value->>'time_zone',draft.value->>'source_excerpt',
  parsed.reference_time,
  'needs_review','none',1,t.created_at,t.created_at,
  LEAST(t.expires_at,s.expires_at)
FROM idempotency_records i
JOIN agent_session_chat_tasks t
  ON t.account_id=i.account_id AND t.actor_user_id=i.actor_user_id
 AND t.task_id=i.response_body->>'task_id'
JOIN agent_sessions s
  ON s.account_id=t.account_id AND s.id=t.origin_session_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(i.response_body->'blocks')='array'
    THEN i.response_body->'blocks' ELSE '[]'::jsonb END
) block
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(block.value)='object'
      AND jsonb_typeof(block.value->'calendar_draft')='object'
    THEN jsonb_build_array(block.value->'calendar_draft') ELSE '[]'::jsonb END
) draft
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN jsonb_typeof(draft.value->'starts_at')='string'
      AND draft.value->>'starts_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      AND pg_input_is_valid(draft.value->>'starts_at','timestamptz')
      THEN (draft.value->>'starts_at')::timestamptz END AS starts_at,
    CASE WHEN jsonb_typeof(draft.value->'ends_at')='string'
      AND draft.value->>'ends_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      AND pg_input_is_valid(draft.value->>'ends_at','timestamptz')
      THEN (draft.value->>'ends_at')::timestamptz END AS ends_at,
    CASE WHEN jsonb_typeof(draft.value->'reference_time')='string'
      AND draft.value->>'reference_time' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
      AND pg_input_is_valid(draft.value->>'reference_time','timestamptz')
      THEN (draft.value->>'reference_time')::timestamptz END AS reference_time
) parsed
WHERE i.status='completed'
  AND i.operation_scope IN ('create_chat_task','create_unscoped_chat_task')
  AND draft.value->>'status'='needs_review'
  AND draft.value->>'external_effect'='none'
  AND draft.value->>'source_request_id'=t.task_id
  AND jsonb_typeof(draft.value->'id')='string'
  AND jsonb_typeof(draft.value->'title')='string'
  AND jsonb_typeof(draft.value->'time_zone')='string'
  AND jsonb_typeof(draft.value->'source_excerpt')='string'
  AND (draft.value->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND char_length(draft.value->>'title') BETWEEN 1 AND 200
  AND char_length(draft.value->>'time_zone') BETWEEN 1 AND 100
  AND char_length(draft.value->>'source_excerpt') BETWEEN 1 AND 1000
  AND btrim(draft.value->>'title')<>''
  AND btrim(draft.value->>'time_zone')<>''
  AND btrim(draft.value->>'source_excerpt')<>''
  AND EXISTS(SELECT 1 FROM pg_timezone_names zone
    WHERE zone.name=draft.value->>'time_zone')
  AND parsed.starts_at IS NOT NULL AND parsed.ends_at IS NOT NULL
  AND parsed.reference_time IS NOT NULL
  AND parsed.ends_at>parsed.starts_at
  AND parsed.ends_at - parsed.starts_at <= interval '7 days'
  AND t.expires_at>statement_timestamp()
  AND s.created_by_user_id=i.actor_user_id
  AND s.payload IS NOT NULL
  AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()
  AND agent_session_chat_sources_available(t.account_id,t.task_id)
ORDER BY i.account_id,t.task_id,i.completed_at DESC
ON CONFLICT DO NOTHING;

-- Test workspaces fail closed whenever a new table is not explicitly covered.
-- Install the guard only after the one-time historical backfill: pre-070 rows
-- can belong to an already-closing Lab workspace and must remain migratable so
-- the verified all-table cleanup can remove them.
INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES
  ('meeting_drafts','account'),
  ('meeting_draft_operations','account'),
  ('meeting_draft_list_snapshots','account'),
  ('meeting_draft_list_snapshot_items','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON meeting_drafts
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON meeting_draft_operations
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON meeting_draft_list_snapshots
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON meeting_draft_list_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
