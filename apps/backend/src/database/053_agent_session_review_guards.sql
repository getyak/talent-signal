-- Source classification is canonical. Client display sentinels never authorize data.
CREATE FUNCTION agent_session_turn_source_available(account uuid, turn jsonb, body jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE task text:=turn->'response'->>'taskID';
BEGIN
  IF EXISTS (SELECT 1 FROM agent_session_retracted_tasks r WHERE r.account_id=account AND r.task_id=task) THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION retract_agent_session_tasks(account uuid, body jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE turn jsonb; task text; manifest record;
BEGIN
  FOR turn IN SELECT value FROM jsonb_array_elements(body->'turns') LOOP
    task:=turn->'response'->>'taskID';
    SELECT m.subject_id,m.assignment_id INTO manifest FROM context_manifests m
      WHERE m.account_id=account AND m.task_id::text=task;
    -- A forged client scope must not poison a still-valid canonical task.
    IF (FOUND AND NOT agent_session_task_available(account,task,manifest.subject_id::text,manifest.assignment_id::text))
      OR (EXISTS (SELECT 1 FROM screenshot_contact_tasks t WHERE t.account_id=account AND t.id::text=task)
        AND NOT agent_session_screenshot_available(account,task)) THEN
      INSERT INTO agent_session_retracted_tasks(account_id,task_id) VALUES(account,task) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION redact_agent_session_payload(account uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb:=body; turn jsonb; turns jsonb:='[]'::jsonb; proposal_unavailable boolean:=false;
BEGIN
  IF body IS NULL THEN RETURN NULL; END IF;
  FOR turn IN SELECT value FROM jsonb_array_elements(body->'turns') LOOP
    IF NOT agent_session_turn_source_available(account,turn,body) THEN
      turn:=jsonb_set(turn,'{response}',(turn->'response')-'savedBlocks'-'unboundConversationBlocks'-'unboundPersonResearchBlocks'-'media');
      IF body->'contactProposal' IS NOT NULL AND
        (body->'contactProposal'->>'sourceMessageID' IS NULL
          OR lower(body->'contactProposal'->>'sourceMessageID')=lower(turn->>'id')) THEN
        proposal_unavailable:=true;
      END IF;
    END IF;
    turns:=turns||jsonb_build_array(turn);
  END LOOP;
  result:=jsonb_set(result,'{turns}',turns);
  IF proposal_unavailable THEN result:=result-'contactProposal'; END IF;
  IF result->'contactProposal' IS NOT NULL AND
    (COALESCE(NULLIF(result->'contactProposal'->>'expiresAt','')::timestamptz,
      (result->'contactProposal'->>'updatedAt')::timestamptz + interval '7 days') <= statement_timestamp()) THEN
    result:=result-'contactProposal';
  END IF;
  IF result->>'composerDraft' IS NOT NULL AND COALESCE(
    NULLIF(result->>'composerDraftUpdatedAt','')::timestamptz,
    (result->>'updatedAt')::timestamptz) + interval '7 days' <= statement_timestamp() THEN
    result:=result-'composerDraft'-'composerDraftUpdatedAt';
  END IF;
  RETURN result;
END;
$$;

-- Keep the first canonical clock for unchanged draft content, including after
-- expiry. Offline replay cannot turn an expired draft into a fresh seven days.
ALTER TABLE agent_sessions ADD COLUMN composer_draft_hash text
  CHECK (composer_draft_hash IS NULL OR composer_draft_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE agent_sessions ADD COLUMN composer_draft_started_at timestamptz;
CREATE FUNCTION protect_agent_session_composer_retention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE content_hash text; started timestamptz;
BEGIN
  IF NEW.payload->>'composerDraft' IS NULL THEN RETURN NEW; END IF;
  content_hash:=encode(sha256(convert_to(NEW.account_id::text||':'||NEW.id::text||':'||(NEW.payload->>'composerDraft'),'UTF8')),'hex');
  IF TG_OP='UPDATE' AND OLD.composer_draft_hash=content_hash AND OLD.composer_draft_started_at IS NOT NULL THEN
    started:=OLD.composer_draft_started_at;
  ELSE
    started:=LEAST(COALESCE(NULLIF(NEW.payload->>'composerDraftUpdatedAt','')::timestamptz,statement_timestamp()),statement_timestamp());
  END IF;
  NEW.composer_draft_hash:=content_hash;
  NEW.composer_draft_started_at:=started;
  IF started+interval '7 days'<=statement_timestamp() THEN
    NEW.payload:=NEW.payload-'composerDraft'-'composerDraftUpdatedAt';
  ELSIF NULLIF(NEW.payload->>'composerDraftUpdatedAt','')::timestamptz IS DISTINCT FROM started THEN
    NEW.payload:=jsonb_set(NEW.payload,'{composerDraftUpdatedAt}',to_jsonb(started));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_agent_session_composer_retention BEFORE INSERT OR UPDATE OF payload ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION protect_agent_session_composer_retention();

UPDATE agent_sessions SET composer_draft_hash=encode(sha256(convert_to(account_id::text||':'||id::text||':'||(payload->>'composerDraft'),'UTF8')),'hex'),
  composer_draft_started_at=LEAST(COALESCE(NULLIF(payload->>'composerDraftUpdatedAt','')::timestamptz,updated_at),updated_at,statement_timestamp())
  WHERE payload->>'composerDraft' IS NOT NULL;
UPDATE agent_sessions SET payload=redact_agent_session_payload(account_id,payload),revision=revision+1,updated_at=now()
  WHERE deleted_at IS NULL AND (payload IS DISTINCT FROM redact_agent_session_payload(account_id,payload) OR payload->>'composerDraft' IS NOT NULL);
