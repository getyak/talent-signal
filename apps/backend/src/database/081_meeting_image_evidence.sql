-- Preserve the image/inspection lineage of screenshot-derived calendar drafts.
ALTER TABLE meeting_drafts ADD COLUMN source_image jsonb;
ALTER TABLE meeting_drafts ADD CONSTRAINT meeting_image_evidence_shape CHECK (
  source_image IS NULL OR (
    jsonb_typeof(source_image)='object'
    AND source_image ?& ARRAY['artifact_id','content_hash','inspection_request_id']
    AND source_image->>'content_hash' ~ '^[a-f0-9]{64}$'
    AND length(source_image->>'artifact_id') BETWEEN 1 AND 300
    AND length(source_image->>'inspection_request_id') BETWEEN 1 AND 500
  )
);
CREATE FUNCTION clear_meeting_image_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('redacted','expired') THEN NEW.source_image=NULL; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clear_meeting_image_evidence
BEFORE INSERT OR UPDATE ON meeting_drafts
FOR EACH ROW EXECUTE FUNCTION clear_meeting_image_evidence();

-- A lineage descriptor must still point at the exact admitted bytes.
CREATE FUNCTION meeting_image_source_available(account uuid, origin_session uuid, source_message text, evidence jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT evidence IS NULL OR EXISTS (
  SELECT 1 FROM conversation_message_images i
  JOIN agent_sessions s ON s.account_id=i.account_id AND s.id=i.session_id
  JOIN conversation_queue_entries q ON q.account_id=i.account_id AND q.id=i.queue_entry_id
  WHERE i.account_id=account AND i.session_id=origin_session AND i.message_id::text=source_message
    AND evidence->>'artifact_id'='conversation-image-'||i.message_id::text||'-'||i.image_index::text||'-'||i.attachment_id::text
    AND i.content_hash=evidence->>'content_hash' AND encode(sha256(i.content),'hex')=i.content_hash
    AND i.expires_at>statement_timestamp() AND q.expires_at>statement_timestamp()
    AND (q.content_state='retained' OR q.status='completed')
    AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()
    AND s.created_by_user_id=q.created_by_user_id
    AND NOT EXISTS(SELECT 1 FROM memory_source_revocations r WHERE r.account_id=account
      AND ((r.source_kind='artifact' AND r.source_id=evidence->>'artifact_id')
        OR (r.source_kind='session' AND r.source_id=origin_session::text)))
 );
$$;
CREATE OR REPLACE FUNCTION meeting_draft_source_available(account uuid, origin_session uuid, source_task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT agent_session_chat_sources_available(account,source_task)
  AND EXISTS(SELECT 1 FROM agent_session_chat_tasks t WHERE t.account_id=account
    AND t.task_id=canonical_agent_session_id(source_task) AND t.origin_session_id=origin_session
    AND t.expires_at>statement_timestamp())
  AND EXISTS(SELECT 1 FROM agent_sessions s WHERE s.account_id=account AND s.id=origin_session
    AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp())
  AND NOT EXISTS(SELECT 1 FROM meeting_drafts d WHERE d.account_id=account
    AND d.origin_session_id=origin_session AND d.source_task_id=canonical_agent_session_id(source_task)
    AND NOT meeting_image_source_available(account,origin_session,d.source_message_id,d.source_image));
$$;
-- One database operation, including replay identity, protects image lineage.
CREATE FUNCTION record_meeting_draft_with_image(
 p_account uuid,p_id uuid,p_user uuid,p_task text,p_session uuid,p_message text,
 p_title text,p_starts_at timestamptz,p_ends_at timestamptz,p_time_zone text,
 p_source_excerpt text,p_reference_time timestamptz,p_expires_at timestamptz,p_image jsonb
) RETURNS meeting_drafts LANGUAGE plpgsql AS $$
DECLARE prior meeting_drafts; result meeting_drafts; had_prior boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||':meeting-image-authority',0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||p_id::text,0));
 SELECT * INTO prior FROM meeting_drafts WHERE account_id=p_account AND id=p_id FOR UPDATE;
 had_prior := FOUND;
 IF had_prior AND (prior.source_image IS DISTINCT FROM p_image OR prior.source_message_id IS DISTINCT FROM p_message) THEN
  RAISE EXCEPTION 'MEETING_DRAFT_IMAGE_IDENTITY_CONFLICT';
 END IF;
 IF NOT meeting_image_source_available(p_account,p_session,p_message,p_image) THEN
  RAISE EXCEPTION 'MEETING_DRAFT_IMAGE_SOURCE_UNAVAILABLE';
 END IF;
 SELECT * INTO result FROM record_meeting_draft(p_account,p_id,p_user,p_task,p_session,p_message,
  p_title,p_starts_at,p_ends_at,p_time_zone,p_source_excerpt,p_reference_time,p_expires_at);
 IF NOT had_prior THEN
  UPDATE meeting_drafts SET source_image=p_image WHERE account_id=p_account AND id=p_id RETURNING * INTO result;
 END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION invalidate_meeting_image_sources() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM redact_unavailable_meeting_drafts(COALESCE(NEW.account_id,OLD.account_id));
 RETURN NULL;
END;
$$;
CREATE TRIGGER invalidate_meeting_image_sources AFTER DELETE OR UPDATE ON conversation_message_images
 FOR EACH ROW EXECUTE FUNCTION invalidate_meeting_image_sources();
CREATE TRIGGER invalidate_meeting_image_revocations AFTER INSERT ON memory_source_revocations
 FOR EACH ROW EXECUTE FUNCTION invalidate_meeting_image_sources();

-- Serialize source withdrawal with draft admission before either mutates state.
CREATE FUNCTION lock_meeting_image_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.account_id,OLD.account_id)::text||':meeting-image-authority',0));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER lock_meeting_image_authority BEFORE DELETE OR UPDATE ON conversation_message_images
 FOR EACH ROW EXECUTE FUNCTION lock_meeting_image_authority();
CREATE TRIGGER lock_meeting_image_revocation BEFORE INSERT ON memory_source_revocations
 FOR EACH ROW EXECUTE FUNCTION lock_meeting_image_authority();
