-- Meeting drafts are account- and user-scoped projections of a CalendarDraft
-- value produced by a session-bound chat task. They are reviewable proposals:
-- external_effect is always 'none'. A draft is never a confirmed calendar event,
-- an invitation, or an execution receipt.
--
-- Every draft is bound to the originating Agent Session and chat task, and it
-- expires no later than that Session/task. When the source is revoked,
-- deleted, expired, or otherwise unavailable, the sensitive draft content is
-- redacted while a non-sensitive tombstone/status remains for auditable reads.
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redacted_at timestamptz,
  dismissed_at timestamptz,
  dismiss_idempotency_key uuid,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id, origin_session_id) REFERENCES agent_sessions(account_id,id),
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
  CHECK ((status = 'dismissed') = (dismiss_idempotency_key IS NOT NULL)),
  CHECK (expires_at > created_at)
);
CREATE INDEX meeting_drafts_owner_idx ON meeting_drafts(account_id,created_by_user_id,created_at,id);
CREATE INDEX meeting_drafts_task_idx ON meeting_drafts(account_id,source_task_id);
CREATE INDEX meeting_drafts_expiry_idx ON meeting_drafts(expires_at) WHERE status = 'needs_review';

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
  UPDATE meeting_drafts d SET
    title=NULL, starts_at=NULL, ends_at=NULL, time_zone=NULL,
    source_excerpt=NULL, reference_time=NULL,
    status='expired', redacted_at=COALESCE(d.redacted_at,now()),
    updated_at=now(), revision=d.revision+1
  WHERE d.account_id=account AND d.status NOT IN ('redacted','expired')
    AND d.expires_at<=statement_timestamp();
  UPDATE meeting_drafts d SET
    title=NULL, starts_at=NULL, ends_at=NULL, time_zone=NULL,
    source_excerpt=NULL, reference_time=NULL,
    status='redacted', redacted_at=COALESCE(d.redacted_at,now()),
    updated_at=now(), revision=d.revision+1
  WHERE d.account_id=account AND d.status NOT IN ('redacted','expired')
    AND NOT meeting_draft_source_available(account,d.origin_session_id,d.source_task_id);
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

-- The chat-source lifecycle is table-driven (screenshots, evidence, retention,
-- captures, people, contexts). Hooking the existing retraction function keeps a
-- single source of truth: whenever a chat source is retracted, pending drafts
-- for those tasks are redacted as well.
CREATE OR REPLACE FUNCTION retract_agent_session_chat_sources(account uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO agent_session_retracted_tasks(account_id,task_id)
    SELECT DISTINCT d.account_id,d.task_id FROM agent_session_chat_sources d
    WHERE d.account_id=account AND NOT agent_session_chat_sources_available(account,d.task_id)
    ON CONFLICT DO NOTHING;
  UPDATE idempotency_records i SET response_body=jsonb_build_object('task_id',i.response_body->>'task_id','source_context_unavailable',true)
    WHERE i.account_id=account AND i.operation_scope IN ('create_chat_task','create_unscoped_chat_task')
      AND i.response_body IS NOT NULL AND NOT COALESCE((i.response_body->>'source_context_unavailable')::boolean,false)
      AND EXISTS (SELECT 1 FROM agent_session_chat_sources d WHERE d.account_id=account AND d.task_id=i.response_body->>'task_id')
      AND NOT agent_session_chat_sources_available(account,i.response_body->>'task_id');
  UPDATE agent_sessions SET payload=redact_agent_session_payload(account,payload),revision=revision+1,updated_at=now()
    WHERE account_id=account AND deleted_at IS NULL AND payload IS DISTINCT FROM redact_agent_session_payload(account,payload);
  PERFORM redact_unavailable_meeting_drafts(account);
END;
$$;

-- Expiry redaction runs at read time and from the existing retention sweep.
CREATE OR REPLACE FUNCTION purge_agent_session_chat_tasks(account uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO agent_session_retracted_tasks(account_id,task_id)
    SELECT t.account_id,t.task_id FROM agent_session_chat_tasks t
    WHERE t.account_id=account AND NOT agent_session_chat_task_available(account,t.task_id)
    ON CONFLICT DO NOTHING;
  UPDATE idempotency_records i SET response_body=jsonb_build_object('task_id',i.response_body->>'task_id','session_context_unavailable',true)
    WHERE i.account_id=account AND i.operation_scope IN ('create_chat_task','create_unscoped_chat_task')
      AND i.response_body IS NOT NULL AND NOT COALESCE((i.response_body->>'session_context_unavailable')::boolean,false)
      AND EXISTS (SELECT 1 FROM agent_session_chat_tasks t WHERE t.account_id=account AND t.task_id=i.response_body->>'task_id')
      AND NOT agent_session_chat_sources_available(account,i.response_body->>'task_id');
  UPDATE agent_sessions SET payload=redact_agent_session_payload(account,payload),revision=revision+1,updated_at=now()
    WHERE account_id=account AND deleted_at IS NULL AND payload IS DISTINCT FROM redact_agent_session_payload(account,payload);
  PERFORM redact_unavailable_meeting_drafts(account);
END;
$$;

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
DECLARE existing meeting_drafts; inserted meeting_drafts;
BEGIN
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
  INSERT INTO meeting_drafts(account_id,id,created_by_user_id,source_task_id,origin_session_id,
    source_message_id,title,starts_at,ends_at,time_zone,source_excerpt,reference_time,
    status,external_effect,revision,expires_at)
  VALUES (p_account,p_id,p_user,canonical_agent_session_id(p_task),p_session,
    p_message,p_title,p_starts_at,p_ends_at,p_time_zone,p_source_excerpt,p_reference_time,
    'needs_review','none',1,p_expires_at)
  RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;
