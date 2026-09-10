ALTER TABLE harness_run_artifacts ADD COLUMN session_authority jsonb;
ALTER TABLE harness_run_artifacts ADD COLUMN previous_run_id uuid REFERENCES product_runs(id);
-- Old files lack a proven Session checkpoint; do not infer it from current state.
UPDATE harness_run_artifacts SET content=NULL,name='unavailable',source_files='[]',source_images='[]' WHERE session_id IS NOT NULL;
ALTER FUNCTION harness_run_artifact_available(uuid) RENAME TO harness_run_artifact_base_available;
CREATE FUNCTION harness_run_artifact_available(artifact_id uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
SELECT COALESCE(harness_run_artifact_base_available(a.id)
  AND NOT EXISTS(SELECT 1 FROM identity_handles h WHERE h.account_id=a.account_id AND h.subject_id=m.subject_id
    AND h.status='confirmed' AND h.valid_until<=clock_timestamp())
  AND (a.previous_run_id IS NULL OR EXISTS(SELECT 1 FROM product_runs r WHERE r.id=a.previous_run_id
    AND r.account_id=a.account_id AND r.user_id=a.user_id AND product_run_source_available(r.id)))
  AND (a.session_id IS NULL OR (a.session_authority IS NOT NULL AND EXISTS(
    SELECT 1 FROM agent_sessions s WHERE s.account_id=a.account_id AND s.id=a.session_id
      AND s.payload->>'personID' IS NOT DISTINCT FROM a.session_authority->>'person_id'
      AND s.payload->>'relationshipContextID' IS NOT DISTINCT FROM a.session_authority->>'context_id'
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.session_authority->'turn_hashes') expected(hash)
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.payload->'turns') turn
          WHERE encode(sha256(convert_to(turn::text,'UTF8')),'hex')=expected.hash))))),false)
FROM harness_run_artifacts a JOIN context_manifests m ON m.account_id=a.account_id AND m.id=a.manifest_id WHERE a.id=artifact_id
$$;
CREATE FUNCTION purge_harness_artifacts_on_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE harness_run_artifacts SET content=NULL,name='unavailable',source_files='[]',source_images='[]',session_authority=NULL
    WHERE account_id=NEW.account_id AND session_id=NEW.id AND content IS NOT NULL AND NOT harness_run_artifact_available(id);
  RETURN NEW;
END $$;
CREATE TRIGGER purge_harness_artifacts_on_session AFTER UPDATE OF payload,deleted_at,expires_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION purge_harness_artifacts_on_session();
CREATE FUNCTION preserve_harness_artifact_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.account_id,NEW.user_id,NEW.manifest_id,NEW.session_id,NEW.source_generation,NEW.previous_run_id,
      NEW.content_hash,NEW.byte_size,NEW.created_at,NEW.media_type)
    IS DISTINCT FROM (OLD.id,OLD.account_id,OLD.user_id,OLD.manifest_id,OLD.session_id,OLD.source_generation,OLD.previous_run_id,
      OLD.content_hash,OLD.byte_size,OLD.created_at,OLD.media_type)
    OR NEW.expires_at>OLD.expires_at OR (NEW.content IS NOT NULL AND
      (OLD.content IS NULL OR (NEW.content,NEW.name,NEW.source_files,NEW.source_images,NEW.session_authority)
        IS DISTINCT FROM (OLD.content,OLD.name,OLD.source_files,OLD.source_images,OLD.session_authority)))
  THEN RAISE EXCEPTION 'Harness artifact authority is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_harness_artifact_authority BEFORE UPDATE ON harness_run_artifacts
  FOR EACH ROW EXECUTE FUNCTION preserve_harness_artifact_authority();
