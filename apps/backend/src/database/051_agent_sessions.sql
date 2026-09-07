-- Sessions retain conversation display and recovery identity, never decisions or effects.
CREATE TABLE agent_sessions (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  payload jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (account_id,id),
  FOREIGN KEY (account_id,created_by_user_id) REFERENCES users(account_id,id),
  CHECK ((deleted_at IS NULL AND payload IS NOT NULL) OR (deleted_at IS NOT NULL AND payload IS NULL)),
  CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=262144)),
  CHECK (expires_at <= created_at + interval '30 days')
);
CREATE INDEX agent_sessions_owner_idx ON agent_sessions(account_id,created_by_user_id,id);
CREATE INDEX agent_sessions_expiry_idx ON agent_sessions(expires_at) WHERE deleted_at IS NULL;
-- Digests and revision receipts only: replay storage cannot retain deleted private content.
CREATE TABLE agent_session_operations (
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  resulting_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,actor_user_id,idempotency_key),
  FOREIGN KEY (account_id,session_id) REFERENCES agent_sessions(account_id,id),
  FOREIGN KEY (account_id,actor_user_id) REFERENCES users(account_id,id)
);

-- A revoked/corrected task cannot regain old derived text after a later authority cycle.
-- This ledger contains task identity only, never message or source content.
CREATE TABLE agent_session_retracted_tasks (
  account_id uuid NOT NULL REFERENCES accounts(id),
  task_id text NOT NULL,
  retracted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,task_id)
);

CREATE FUNCTION agent_session_task_available(account uuid, task text, person text, context text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM context_manifests m
    JOIN knowledge_snapshots s ON s.account_id=m.account_id AND s.id=m.knowledge_snapshot_id
    JOIN subjects p ON p.account_id=m.account_id AND p.id=m.subject_id AND p.status='active'
    JOIN assignments a ON a.account_id=m.account_id AND a.id=m.assignment_id AND a.status='active'
    WHERE m.account_id=account AND m.task_id::text=task AND m.subject_id::text=person
      AND m.assignment_id::text=context AND m.status IN ('active','superseded') AND s.status IN ('published','superseded')
      AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks rt WHERE rt.account_id=account AND rt.task_id=task)
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
            OR sr.authorization_expires_at<=now())
      )
  )
$$;

CREATE FUNCTION agent_session_screenshot_available(account uuid, task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM screenshot_contact_tasks t
    LEFT JOIN captures c ON c.account_id=t.account_id AND c.id=t.capture_id
    LEFT JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
    WHERE t.account_id=account AND t.id::text=task AND t.status<>'deleted' AND t.expires_at>now()
      AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks rt WHERE rt.account_id=account AND rt.task_id=task)
      AND (t.capture_id IS NULL OR (c.status='active' AND sr.source_access_state<>'deleted'
        AND sr.authorization_state='authorized' AND (sr.authorization_expires_at IS NULL OR sr.authorization_expires_at>now()))))
$$;

CREATE FUNCTION retract_agent_session_tasks(account uuid, body jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE turn jsonb;
BEGIN
  FOR turn IN SELECT value FROM jsonb_array_elements(body->'turns') LOOP
    IF ((turn->'response'->>'contextManifestID') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
      AND NOT agent_session_task_available(account,turn->'response'->>'taskID',body->>'personID',body->>'relationshipContextID'))
      OR ((turn->'response'->>'disposition'='screenshot_processing' OR COALESCE(body->'screenshotTaskIDs','[]'::jsonb) ? (turn->'response'->>'taskID'))
        AND NOT agent_session_screenshot_available(account,turn->'response'->>'taskID')) THEN
      INSERT INTO agent_session_retracted_tasks(account_id,task_id) VALUES(account,turn->'response'->>'taskID') ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION redact_agent_session_payload(account uuid, body jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb:=body; turn jsonb; turns jsonb:='[]'::jsonb; changed boolean:=false;
BEGIN
  IF body IS NULL THEN RETURN NULL; END IF;
  FOR turn IN SELECT value FROM jsonb_array_elements(body->'turns') LOOP
    IF ((turn->'response'->>'contextManifestID') ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$'
      AND NOT agent_session_task_available(account,turn->'response'->>'taskID',body->>'personID',body->>'relationshipContextID'))
      OR ((turn->'response'->>'disposition'='screenshot_processing' OR COALESCE(body->'screenshotTaskIDs','[]'::jsonb) ? (turn->'response'->>'taskID'))
        AND NOT agent_session_screenshot_available(account,turn->'response'->>'taskID')) THEN
      IF (turn->'response'->'savedBlocks') IS NOT NULL OR (turn->'response'->'unboundConversationBlocks') IS NOT NULL OR (turn->'response'->'unboundPersonResearchBlocks') IS NOT NULL THEN
        turn:=jsonb_set(turn,'{response}',(turn->'response')-'savedBlocks'-'unboundConversationBlocks'-'unboundPersonResearchBlocks'-'media');
        changed:=true;
      END IF;
    END IF;
    turns:=turns||jsonb_build_array(turn);
  END LOOP;
  result:=jsonb_set(result,'{turns}',turns);
  IF changed THEN result:=result-'contactProposal'; END IF;
  IF result->'contactProposal' IS NOT NULL AND
    (COALESCE(NULLIF(result->'contactProposal'->>'expiresAt','')::timestamptz,
      (result->'contactProposal'->>'updatedAt')::timestamptz + interval '7 days') <= now()) THEN
    result:=result-'contactProposal';
  END IF;
  IF result->>'composerDraft' IS NOT NULL AND COALESCE(
    NULLIF(result->>'composerDraftUpdatedAt','')::timestamptz,
    (result->>'updatedAt')::timestamptz) + interval '7 days' <= now() THEN
    result:=result-'composerDraft'-'composerDraftUpdatedAt';
  END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION invalidate_agent_session_derivatives() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='evidence_fragments' AND (
    to_jsonb(NEW)->'text_content' IS DISTINCT FROM to_jsonb(OLD)->'text_content'
    OR to_jsonb(NEW)->'attributed_actor' IS DISTINCT FROM to_jsonb(OLD)->'attributed_actor') THEN
    INSERT INTO agent_session_retracted_tasks(account_id,task_id)
      SELECT m.account_id,m.task_id::text FROM context_manifests m
      JOIN context_manifest_evidence me ON me.account_id=m.account_id AND me.manifest_id=m.id
      WHERE me.account_id=NEW.account_id AND me.evidence_fragment_id=(to_jsonb(NEW)->>'id')::uuid
      ON CONFLICT DO NOTHING;
  END IF;
  -- Revoke even tasks not yet uploaded by a temporarily offline device.
  INSERT INTO agent_session_retracted_tasks(account_id,task_id)
    SELECT m.account_id,m.task_id::text FROM context_manifests m
    WHERE m.account_id=NEW.account_id AND NOT agent_session_task_available(m.account_id,m.task_id::text,m.subject_id::text,m.assignment_id::text)
    ON CONFLICT DO NOTHING;
  PERFORM retract_agent_session_tasks(account_id,payload) FROM agent_sessions
    WHERE account_id=NEW.account_id AND deleted_at IS NULL;
  UPDATE agent_sessions SET payload=redact_agent_session_payload(NEW.account_id,payload),revision=revision+1,updated_at=now()
  WHERE account_id=NEW.account_id AND deleted_at IS NULL
    AND payload IS DISTINCT FROM redact_agent_session_payload(NEW.account_id,payload);
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_agent_session_evidence AFTER UPDATE OF text_content,status,review_status,attribution_status,attributed_actor ON evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_authorization AFTER UPDATE OF source_access_state,authorization_state,authorization_expires_at ON source_retention_receipts
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_capture AFTER UPDATE OF status,subject_id,assignment_id ON captures
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_manifest AFTER UPDATE OF status ON context_manifests
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_snapshot AFTER UPDATE OF status ON knowledge_snapshots
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();

CREATE TRIGGER invalidate_agent_session_screenshot AFTER UPDATE OF status,expires_at,capture_id ON screenshot_contact_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_resource AFTER UPDATE OF processing_state ON source_resources
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_person AFTER UPDATE OF status ON subjects
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
CREATE TRIGGER invalidate_agent_session_context AFTER UPDATE OF status ON assignments
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_derivatives();
