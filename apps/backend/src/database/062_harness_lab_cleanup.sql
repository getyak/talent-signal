-- Full migration names are stable identities across the parallel GET-9/GET-23 branches.
INSERT INTO lab_test_workspace_table_manifest(table_name,scope) VALUES
 ('harness_source_generations','account'),('harness_sessions','account'),
 ('harness_session_entries','account'),('agent_user_preferences','account');
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['harness_source_generations','harness_sessions',
    'harness_session_entries','agent_user_preferences'] LOOP
    EXECUTE format('CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard()', item);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION invalidate_harness_source_generation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner uuid;
BEGIN
  IF TG_OP='UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
  IF TG_OP='DELETE' THEN owner:=OLD.account_id; ELSE owner:=NEW.account_id; END IF;
  -- Only the verified all-table cleanup transaction may omit derivative updates.
  IF TG_OP='DELETE' AND current_setting('talent_signal.lab_cleanup_account',true)=owner::text
    AND EXISTS(SELECT 1 FROM lab_test_workspaces w JOIN users u
      ON u.account_id=w.target_account_id AND u.id=w.target_user_id
      WHERE w.target_account_id=owner AND w.state='deleting' AND u.kind='lab_human' AND u.status='revoked')
  THEN RETURN OLD; END IF;
  INSERT INTO harness_source_generations(account_id,generation) VALUES(owner,1)
    ON CONFLICT(account_id) DO UPDATE SET generation=harness_source_generations.generation+1;
  UPDATE harness_sessions SET invalidated_at=clock_timestamp() WHERE account_id=owner AND invalidated_at IS NULL;
  DELETE FROM harness_session_entries WHERE account_id=owner;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
