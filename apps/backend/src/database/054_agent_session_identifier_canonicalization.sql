CREATE FUNCTION canonical_agent_session_id(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN lower(value) ELSE value END
$$;

CREATE OR REPLACE FUNCTION agent_session_task_available(account uuid, task text, person text, context text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM context_manifests m
    JOIN knowledge_snapshots s ON s.account_id=m.account_id AND s.id=m.knowledge_snapshot_id
    JOIN subjects p ON p.account_id=m.account_id AND p.id=m.subject_id AND p.status='active'
    JOIN assignments a ON a.account_id=m.account_id AND a.id=m.assignment_id AND a.status='active'
    WHERE m.account_id=account AND m.task_id::text=canonical_agent_session_id(task) AND m.subject_id::text=canonical_agent_session_id(person)
      AND m.assignment_id::text=canonical_agent_session_id(context) AND m.status IN ('active','superseded') AND s.status IN ('published','superseded')
      AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks rt WHERE rt.account_id=account AND rt.task_id=canonical_agent_session_id(task))
      AND NOT EXISTS (
        SELECT 1 FROM context_manifest_evidence me
        LEFT JOIN evidence_fragments f ON f.account_id=me.account_id AND f.id=me.evidence_fragment_id
        LEFT JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
        LEFT JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
        LEFT JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
        WHERE me.account_id=m.account_id AND me.manifest_id=m.id
          AND (f.id IS NULL OR f.status IS DISTINCT FROM 'active' OR f.review_status IS DISTINCT FROM 'reviewed'
            OR f.attribution_status IS DISTINCT FROM 'confirmed' OR f.text_content IS NULL OR length(trim(f.text_content))=0
            OR c.subject_id IS DISTINCT FROM m.subject_id OR c.assignment_id IS DISTINCT FROM m.assignment_id
            OR r.processing_state IS NOT DISTINCT FROM 'deleted' OR c.status IS DISTINCT FROM 'active'
            OR sr.source_access_state IS NULL OR sr.source_access_state='deleted'
            OR sr.authorization_state IS DISTINCT FROM 'authorized'
            OR sr.authorization_expires_at<=statement_timestamp())
      )
  )
$$;

CREATE OR REPLACE FUNCTION agent_session_screenshot_available(account uuid, task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM screenshot_contact_tasks t
    LEFT JOIN captures c ON c.account_id=t.account_id AND c.id=t.capture_id
    LEFT JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
    WHERE t.account_id=account AND t.id::text=canonical_agent_session_id(task) AND t.status<>'deleted' AND t.expires_at>statement_timestamp()
      AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks rt WHERE rt.account_id=account AND rt.task_id=canonical_agent_session_id(task))
      AND (t.capture_id IS NULL OR (c.status='active' AND sr.source_access_state<>'deleted'
        AND sr.authorization_state='authorized' AND (sr.authorization_expires_at IS NULL OR sr.authorization_expires_at>statement_timestamp()))))
$$;

CREATE OR REPLACE FUNCTION agent_session_turn_source_available(account uuid, turn jsonb, body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE task text:=canonical_agent_session_id(turn->'response'->>'taskID');
BEGIN
  IF EXISTS (SELECT 1 FROM agent_session_retracted_tasks r WHERE r.account_id=account AND r.task_id=task) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM context_manifests m WHERE m.account_id=account AND m.task_id::text=canonical_agent_session_id(task)) THEN
    RETURN agent_session_task_available(account,task,body->>'personID',body->>'relationshipContextID');
  END IF;
  IF EXISTS (SELECT 1 FROM screenshot_contact_tasks t WHERE t.account_id=account AND t.id::text=canonical_agent_session_id(task)) THEN
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

CREATE OR REPLACE FUNCTION retract_agent_session_tasks(account uuid, body jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE turn jsonb; task text; manifest record;
BEGIN
  FOR turn IN SELECT value FROM jsonb_array_elements(body->'turns') LOOP
    task:=canonical_agent_session_id(turn->'response'->>'taskID');
    SELECT m.subject_id,m.assignment_id INTO manifest FROM context_manifests m
      WHERE m.account_id=account AND m.task_id::text=canonical_agent_session_id(task);
    -- A forged client scope must not poison a still-valid canonical task.
    IF (FOUND AND NOT agent_session_task_available(account,task,manifest.subject_id::text,manifest.assignment_id::text))
      OR (EXISTS (SELECT 1 FROM screenshot_contact_tasks t WHERE t.account_id=account AND t.id::text=canonical_agent_session_id(task))
        AND NOT agent_session_screenshot_available(account,task)) THEN
      INSERT INTO agent_session_retracted_tasks(account_id,task_id) VALUES(account,task) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION retire_deleted_session_screenshot_tasks() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task_ids uuid[];
BEGIN
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN RETURN NEW; END IF;
  SELECT array_agg(t.id) INTO task_ids FROM screenshot_contact_tasks t
    WHERE t.account_id=NEW.account_id AND t.created_by_user_id=NEW.created_by_user_id AND t.status<>'deleted'
      AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(OLD.payload->'screenshotTaskIDs','[]'::jsonb)) ref WHERE canonical_agent_session_id(ref.value)=t.id::text)
        OR NEW.screenshot_admission_key_hash=encode(sha256(convert_to(t.idempotency_key,'UTF8')),'hex'))
      AND NOT EXISTS (SELECT 1 FROM agent_sessions s
        WHERE s.account_id=NEW.account_id AND s.created_by_user_id=NEW.created_by_user_id AND s.id<>NEW.id
          AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()
          AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.payload->'screenshotTaskIDs','[]'::jsonb)) ref WHERE canonical_agent_session_id(ref.value)=t.id::text)
            OR s.screenshot_admission_key_hash=encode(sha256(convert_to(t.idempotency_key,'UTF8')),'hex')));
  IF task_ids IS NULL THEN RETURN NEW; END IF;
  DELETE FROM contact_profile_observations WHERE account_id=NEW.account_id AND task_id=ANY(task_ids);
  UPDATE screenshot_contact_tasks SET status='deleted',state='{}'::jsonb,input_manifest='{}'::jsonb,
    revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
    WHERE account_id=NEW.account_id AND id=ANY(task_ids) AND status<>'deleted';
  -- Existing contact_task_images trigger queues permanent raw-image purge. Filed
  -- contact/source records retain their independently governed lifecycle.
  RETURN NEW;
END;
$$;

