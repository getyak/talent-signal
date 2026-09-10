-- A current screenshot checkpoint can replace output, but cannot authorize an
-- earlier model's deleted source material or its feedback snapshots again.
CREATE FUNCTION purge_product_run_prior_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_generation IS DISTINCT FROM OLD.source_generation THEN
    NEW.input := NULL; NEW.output := NULL; NEW.objective := '';
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
CREATE TRIGGER product_run_prior_generation_purge BEFORE UPDATE OF source_generation ON product_runs
FOR EACH ROW EXECUTE FUNCTION purge_product_run_prior_generation();
