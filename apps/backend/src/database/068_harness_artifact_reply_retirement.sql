-- A cached reply can repeat a source-bearing file name in both its manifest and
-- model prose. Retire the whole derived reply rather than rewriting its meaning.
CREATE FUNCTION retire_harness_artifact_reply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content IS NOT NULL AND NEW.content IS NULL THEN
    UPDATE idempotency_records SET response_body=jsonb_build_object('task_id',response_body->>'task_id','source_context_unavailable',true)
      WHERE account_id=OLD.account_id AND actor_user_id=OLD.user_id AND operation_scope='create_chat_task'
        AND response_body->>'context_manifest_id'=OLD.manifest_id::text;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retire_harness_artifact_reply AFTER UPDATE OF content ON harness_run_artifacts
  FOR EACH ROW EXECUTE FUNCTION retire_harness_artifact_reply();
-- Retire already invalid caches when upgrading a deployed database.
UPDATE idempotency_records i SET response_body=jsonb_build_object('task_id',i.response_body->>'task_id','source_context_unavailable',true)
  WHERE i.operation_scope='create_chat_task' AND EXISTS(SELECT 1 FROM harness_run_artifacts a
    WHERE a.account_id=i.account_id AND a.user_id=i.actor_user_id AND a.manifest_id::text=i.response_body->>'context_manifest_id'
      AND NOT harness_run_artifact_available(a.id));
