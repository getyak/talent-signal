-- Explicitly classify post-Lab additions before exposing test workspaces on Web.
-- Unknown future tables still fail closed; never infer cleanup coverage at runtime.
INSERT INTO lab_test_workspace_table_manifest(table_name,scope) VALUES
 ('agent_session_chat_sources','account'),('agent_session_chat_tasks','account'),
 ('agent_session_operations','account'),('agent_session_retracted_tasks','account'),
 ('agent_sessions','account'),('contact_archive_operations','account'),
 ('contact_profile_observations','account'),('contact_task_images','account'),
 ('feedback_execution_snapshots','account'),('lab_feature_overrides','account'),
 ('product_feedback','account'),('product_feedback_observations','account'),
 ('product_feedback_operations','account'),('screenshot_contact_tasks','account'),
 ('google_consumed_assertions','global'),('google_login_challenges','global');
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['agent_session_chat_sources','agent_session_chat_tasks',
    'agent_session_operations','agent_session_retracted_tasks','agent_sessions',
    'contact_archive_operations','contact_profile_observations','contact_task_images',
    'feedback_execution_snapshots','lab_feature_overrides','product_feedback',
    'product_feedback_observations','product_feedback_operations','screenshot_contact_tasks'] LOOP
    EXECUTE format('CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard()', item);
  END LOOP;
END $$;
