-- Identity and digests only: screenshot-derived chat never acquires source authority.
CREATE TABLE agent_session_chat_sources (
  account_id uuid NOT NULL,
  task_id text NOT NULL,
  actor_user_id uuid NOT NULL,
  screenshot_task_id uuid NOT NULL,
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (account_id, task_id, screenshot_task_id),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id, screenshot_task_id) REFERENCES screenshot_contact_tasks(account_id,id)
);
CREATE INDEX agent_session_chat_source_task_idx ON agent_session_chat_sources(account_id,screenshot_task_id);

CREATE FUNCTION agent_session_screenshot_fingerprint(task screenshot_contact_tasks)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'summary',(task).state->'response'->'summary','findings',(task).state->'response'->'findings',
    'extraction',(task).state->'response'->'extraction','question',(task).state->'response'->'question',
    'limitations',(task).state->'response'->'limitations','person',(task).subject_id,'context',(task).assignment_id
  )::text,'UTF8')),'hex')
$$;

CREATE FUNCTION agent_session_screenshot_context_available(account uuid, task uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM screenshot_contact_tasks t
    LEFT JOIN captures c ON c.account_id=t.account_id AND c.id=t.capture_id
    LEFT JOIN subjects p ON p.account_id=c.account_id AND p.id=c.subject_id
    LEFT JOIN assignments a ON a.account_id=c.account_id AND a.id=c.assignment_id
    LEFT JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
    WHERE t.account_id=account AND t.id=task AND t.status<>'deleted' AND t.expires_at>statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks r WHERE r.account_id=account AND r.task_id=t.id::text)
      AND (t.capture_id IS NULL OR (c.status='active' AND p.status='active' AND a.status='active' AND c.retention_until>statement_timestamp()
        AND c.subject_id=t.subject_id AND c.assignment_id=t.assignment_id
        AND sr.source_access_state NOT IN ('purged','deleted') AND sr.authorization_state='authorized'
        AND (sr.authorization_expires_at IS NULL OR sr.authorization_expires_at>statement_timestamp()))))
$$;

CREATE FUNCTION agent_session_chat_sources_available(account uuid, task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks r WHERE r.account_id=account AND r.task_id=canonical_agent_session_id(task))
    AND NOT EXISTS (SELECT 1 FROM agent_session_chat_sources d
      LEFT JOIN screenshot_contact_tasks t ON t.account_id=d.account_id AND t.id=d.screenshot_task_id
      WHERE d.account_id=account AND d.task_id=canonical_agent_session_id(task)
      AND (t.id IS NULL OR t.created_by_user_id<>d.actor_user_id
        OR NOT agent_session_screenshot_context_available(account,t.id)
        OR agent_session_screenshot_fingerprint(t)<>d.source_fingerprint))
$$;

CREATE FUNCTION retract_agent_session_chat_sources(account uuid) RETURNS void LANGUAGE plpgsql AS $$
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
END;
$$;

CREATE FUNCTION invalidate_agent_session_chat_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='evidence_fragments' THEN
    IF (NEW.text_content IS DISTINCT FROM OLD.text_content
      OR NEW.status='deleted' OR NEW.review_status='rejected'
      OR NEW.attributed_actor IS DISTINCT FROM OLD.attributed_actor) THEN
    INSERT INTO agent_session_retracted_tasks(account_id,task_id)
      SELECT t.account_id,t.id::text FROM screenshot_contact_tasks t WHERE t.account_id=NEW.account_id AND t.capture_id=NEW.capture_id
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  PERFORM retract_agent_session_chat_sources(NEW.account_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_session_chat_screenshot AFTER UPDATE OF state,status,expires_at,capture_id,subject_id,assignment_id ON screenshot_contact_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();
CREATE TRIGGER invalidate_session_chat_retention AFTER UPDATE OF source_access_state,authorization_state,authorization_expires_at ON source_retention_receipts
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();
CREATE TRIGGER invalidate_session_chat_capture AFTER UPDATE OF status,subject_id,assignment_id,retention_until ON captures
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();
CREATE TRIGGER invalidate_session_chat_person AFTER UPDATE OF status ON subjects
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();
CREATE TRIGGER invalidate_session_chat_context AFTER UPDATE OF status ON assignments
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();
CREATE TRIGGER invalidate_session_chat_evidence AFTER UPDATE OF text_content,status,review_status,attributed_actor ON evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_sources();

-- Reuse the display redactor's canonical classification for unscoped derivatives.
CREATE OR REPLACE FUNCTION agent_session_turn_source_available(account uuid, turn jsonb, body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE task text:=canonical_agent_session_id(turn->'response'->>'taskID');
BEGIN
  IF NOT agent_session_chat_sources_available(account,task) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM context_manifests m WHERE m.account_id=account AND m.task_id::text=task) THEN
    RETURN agent_session_task_available(account,task,body->>'personID',body->>'relationshipContextID');
  END IF;
  IF EXISTS (SELECT 1 FROM screenshot_contact_tasks t WHERE t.account_id=account AND t.id::text=task) THEN
    RETURN agent_session_screenshot_available(account,task);
  END IF;
  IF (turn->'response'->>'contextManifestID') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
    OR turn->'response'->>'disposition'='screenshot_processing'
    OR COALESCE(body->'screenshotTaskIDs','[]'::jsonb) ? task
    OR EXISTS (SELECT 1 FROM idempotency_records i WHERE i.account_id=account
      AND i.operation_scope='create_chat_task' AND i.response_body->>'task_id'=task) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
