-- A Session may be removed while screenshot admission has committed but its receipt
-- has not reached the device. Keep only a key digest after transcript erasure.
ALTER TABLE agent_sessions ADD COLUMN screenshot_admission_key_hash text
  CHECK (screenshot_admission_key_hash IS NULL OR screenshot_admission_key_hash ~ '^[0-9a-f]{64}$');
UPDATE agent_sessions SET screenshot_admission_key_hash=
  encode(sha256(convert_to(payload->>'pendingScreenshotIdempotencyKey','UTF8')),'hex')
  WHERE payload->>'pendingScreenshotIdempotencyKey' IS NOT NULL;
CREATE INDEX agent_sessions_deleted_admission_idx
  ON agent_sessions(account_id,created_by_user_id,screenshot_admission_key_hash)
  WHERE screenshot_admission_key_hash IS NOT NULL;

CREATE FUNCTION preserve_agent_session_screenshot_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload->>'pendingScreenshotIdempotencyKey' IS NOT NULL THEN
    NEW.screenshot_admission_key_hash:=encode(sha256(convert_to(NEW.payload->>'pendingScreenshotIdempotencyKey','UTF8')),'hex');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_agent_session_screenshot_admission
  BEFORE INSERT OR UPDATE OF payload ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION preserve_agent_session_screenshot_admission();

CREATE FUNCTION retire_deleted_session_screenshot_tasks() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task_ids uuid[];
BEGIN
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN RETURN NEW; END IF;
  SELECT array_agg(t.id) INTO task_ids FROM screenshot_contact_tasks t
    WHERE t.account_id=NEW.account_id AND t.created_by_user_id=NEW.created_by_user_id AND t.status<>'deleted'
      AND (COALESCE(OLD.payload->'screenshotTaskIDs','[]'::jsonb) ? t.id::text
        OR NEW.screenshot_admission_key_hash=encode(sha256(convert_to(t.idempotency_key,'UTF8')),'hex'))
      AND NOT EXISTS (SELECT 1 FROM agent_sessions s
        WHERE s.account_id=NEW.account_id AND s.created_by_user_id=NEW.created_by_user_id AND s.id<>NEW.id
          AND s.deleted_at IS NULL AND s.expires_at>now()
          AND (COALESCE(s.payload->'screenshotTaskIDs','[]'::jsonb) ? t.id::text
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
CREATE TRIGGER retire_deleted_session_screenshot_tasks
  AFTER UPDATE OF deleted_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION retire_deleted_session_screenshot_tasks();
