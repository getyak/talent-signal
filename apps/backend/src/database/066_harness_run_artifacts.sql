-- Derived files are subordinate to the complete Run source authority.
CREATE TABLE harness_run_artifacts (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  manifest_id uuid NOT NULL, session_id uuid, source_generation bigint NOT NULL,
  source_images jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(source_images)='array'),
  source_files jsonb NOT NULL CHECK(jsonb_typeof(source_files)='array'),
  name text NOT NULL CHECK(name ~ '^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,83}$'),
  media_type text NOT NULL CHECK(media_type IN ('application/json','text/plain','text/csv')),
  content text, content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 0 AND 64000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
  CHECK(content IS NULL OR (octet_length(content)=byte_size AND encode(sha256(convert_to(content,'UTF8')),'hex')=content_hash)),
  CHECK(expires_at<=created_at+interval '7 days'),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id),
  FOREIGN KEY(account_id,manifest_id) REFERENCES context_manifests(account_id,id),
  FOREIGN KEY(account_id,session_id) REFERENCES agent_sessions(account_id,id)
);
CREATE INDEX harness_run_artifact_scope ON harness_run_artifacts(account_id,user_id,manifest_id);
CREATE FUNCTION harness_run_artifact_available(artifact_id uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
SELECT COALESCE(a.content IS NOT NULL AND a.expires_at>clock_timestamp() AND a.source_generation=g.generation
  AND u.status='active'
  AND agent_session_task_available(a.account_id,m.task_id::text,m.subject_id::text,m.assignment_id::text)
  AND agent_session_chat_sources_available(a.account_id,m.task_id::text)
  AND (a.session_id IS NULL OR EXISTS(SELECT 1 FROM agent_sessions s WHERE s.account_id=a.account_id
    AND s.created_by_user_id=a.user_id AND s.id=a.session_id AND s.deleted_at IS NULL AND s.expires_at>clock_timestamp()))
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.source_images) source_image WHERE NOT EXISTS(
    SELECT 1 FROM contact_task_images i JOIN screenshot_contact_tasks t ON t.account_id=i.account_id AND t.id=i.task_id
    WHERE i.account_id=a.account_id AND i.task_id::text=source_image->>'task_id'
      AND i.image_index=(source_image->>'image_index')::integer AND i.content_hash=source_image->>'content_hash'
      AND i.status='stored' AND i.expires_at>clock_timestamp() AND t.created_by_user_id=a.user_id
      AND t.status<>'deleted' AND t.expires_at>clock_timestamp()))
  AND NOT EXISTS(SELECT 1 FROM context_manifest_evidence e JOIN evidence_fragments f ON f.account_id=e.account_id AND f.id=e.evidence_fragment_id
    JOIN captures c ON c.account_id=f.account_id AND c.id=f.capture_id
    JOIN source_retention_receipts r ON r.account_id=c.account_id AND r.capture_id=c.id
    WHERE e.account_id=a.account_id AND e.manifest_id=a.manifest_id
      AND (c.retention_until<=clock_timestamp() OR r.retention_until<=clock_timestamp()))
  AND NOT EXISTS(SELECT 1 FROM lab_test_workspaces w WHERE w.target_account_id=a.account_id
    AND (w.state<>'active' OR w.expires_at<=clock_timestamp())),false)
FROM harness_run_artifacts a JOIN context_manifests m ON m.account_id=a.account_id AND m.id=a.manifest_id
JOIN users u ON u.account_id=a.account_id AND u.id=a.user_id
JOIN harness_source_generations g ON g.account_id=a.account_id WHERE a.id=artifact_id
$$;
CREATE FUNCTION purge_harness_run_artifacts_on_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.generation IS DISTINCT FROM OLD.generation THEN
    UPDATE harness_run_artifacts SET content=NULL,name='unavailable',source_files='[]',source_images='[]'
      WHERE account_id=NEW.account_id AND content IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purge_harness_run_artifacts_on_generation AFTER UPDATE OF generation ON harness_source_generations
  FOR EACH ROW EXECUTE FUNCTION purge_harness_run_artifacts_on_generation();
INSERT INTO lab_test_workspace_table_manifest(table_name,scope) VALUES('harness_run_artifacts','account');
CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON harness_run_artifacts
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
