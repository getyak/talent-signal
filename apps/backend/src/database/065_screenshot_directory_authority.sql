-- Keep only a content-free admission envelope when a canonical checkpoint replaces a generation.
CREATE OR REPLACE FUNCTION purge_product_run_prior_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_generation IS DISTINCT FROM OLD.source_generation THEN
    NEW.input := '{"status":"unavailable","original_bytes":0,"retained_bytes":0,"sha256":null}'::jsonb; NEW.output := NULL; NEW.objective := '';
    NEW.comment := ''; NEW.correction := ''; NEW.selected_text := '';
    NEW.sentiment := NULL; NEW.reasons := '[]'::jsonb; NEW.feedback_updated_at := NULL;
    UPDATE product_run_spans SET span=(span-'input'-'output'-'error'-'metadata') || jsonb_build_object(
      'input',jsonb_build_object('status','unavailable','original_bytes',0,'retained_bytes',0,'sha256',NULL),
      'output',jsonb_build_object('status','unavailable','original_bytes',0,'retained_bytes',0,'sha256',NULL),
      'metadata','{}'::jsonb,'error',CASE WHEN span->>'error' IS NOT NULL THEN 'Operation failed' ELSE NULL END)
      WHERE run_id=OLD.id;
    UPDATE product_run_feedback_events SET output='null'::jsonb,comment='',correction='',selected_text=''
      WHERE run_id=OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION contact_task_directory_available(owner uuid, payload jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM jsonb_path_query(payload,'$.**.person_id') ref
    WHERE jsonb_typeof(ref)='string' AND NOT EXISTS (
      SELECT 1 FROM subjects WHERE account_id=owner AND id::text=ref#>>'{}' AND status='active'))
  AND NOT EXISTS (SELECT 1 FROM jsonb_path_query(payload,'$.**.relationship_context_id') ref
    WHERE jsonb_typeof(ref)='string' AND NOT EXISTS (
      SELECT 1 FROM assignments WHERE account_id=owner AND id::text=ref#>>'{}' AND status='active'))
$$;

-- Preserve the original extraction and images. Directory-derived context needs
-- a new search after a person/context is removed, archived or renamed.
CREATE FUNCTION reset_contact_task_directory_state(payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT payload || jsonb_build_object('searches','[]'::jsonb,'observations','[]'::jsonb,
    'selected',NULL,'pending_research',NULL,'turns',0,
    'response',((payload->'response')-'contact_draft') || jsonb_build_object(
      'status','waiting_for_user','contact',NULL,'candidates','[]'::jsonb,
      'summary','','findings','[]'::jsonb,'profile_fields','[]'::jsonb,
      'public_sources','[]'::jsonb,'events','[]'::jsonb,
      'question','联系人目录已更新，请继续以重新查找匹配。'))
$$;
CREATE FUNCTION invalidate_contact_task_directory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE path jsonpath;
BEGIN
  IF TG_OP='DELETE' AND current_setting('talent_signal.lab_cleanup_account',true)=OLD.account_id::text
    AND EXISTS(SELECT 1 FROM lab_test_workspaces w JOIN users u
      ON u.account_id=w.target_account_id AND u.id=w.target_user_id
      WHERE w.target_account_id=OLD.account_id AND w.state='deleting'
        AND u.kind='lab_human' AND u.status='revoked') THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.display_label IS NOT DISTINCT FROM OLD.display_label
    AND (to_jsonb(NEW)->'subject_id') IS NOT DISTINCT FROM (to_jsonb(OLD)->'subject_id') THEN RETURN NEW; END IF;
  path:=CASE WHEN TG_TABLE_NAME='subjects' THEN '$.**.person_id ? (@ == $id)' ELSE '$.**.relationship_context_id ? (@ == $id)' END;
  UPDATE screenshot_contact_tasks SET state=reset_contact_task_directory_state(state),
    status='waiting_for_user',subject_id=NULL,assignment_id=NULL,
    revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
    WHERE account_id=OLD.account_id AND capture_id IS NULL AND status NOT IN ('deleted','cancelled')
      AND jsonb_path_exists(state,path,jsonb_build_object('id',OLD.id::text));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contact_task_person_directory_changed AFTER DELETE OR UPDATE OF status,display_label ON subjects
FOR EACH ROW EXECUTE FUNCTION invalidate_contact_task_directory();
CREATE TRIGGER contact_task_context_directory_changed AFTER DELETE OR UPDATE OF status,display_label,subject_id ON assignments
FOR EACH ROW EXECUTE FUNCTION invalidate_contact_task_directory();

UPDATE screenshot_contact_tasks SET state=reset_contact_task_directory_state(state),
  status='waiting_for_user',subject_id=NULL,assignment_id=NULL,
  revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
WHERE capture_id IS NULL AND status NOT IN ('deleted','cancelled')
  AND NOT contact_task_directory_available(account_id,state);

ALTER FUNCTION agent_session_screenshot_context_available(uuid,uuid) RENAME TO agent_session_screenshot_context_before_directory;
CREATE FUNCTION agent_session_screenshot_context_available(owner uuid,task uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT agent_session_screenshot_context_before_directory(owner,task)
    AND EXISTS(SELECT 1 FROM screenshot_contact_tasks WHERE account_id=owner AND id=task
      AND contact_task_directory_available(owner,state))
$$;
