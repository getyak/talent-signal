-- Diagnostic content is a derivative of a committed, still-authorized task.
ALTER TABLE product_runs ADD COLUMN source_generation bigint;
UPDATE product_runs r SET source_generation=g.generation
  FROM harness_source_generations g WHERE g.account_id=r.account_id
    AND r.task_id IS NOT NULL AND r.status<>'failed' AND product_run_source_available(r.id);
ALTER FUNCTION product_run_source_available(uuid) RENAME TO product_run_source_available_legacy;
CREATE FUNCTION product_run_source_available(run_id uuid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
SELECT COALESCE(r.task_id IS NOT NULL AND r.status<>'failed'
  AND r.expires_at>clock_timestamp() AND r.source_generation=g.generation
  AND product_run_source_available_legacy(r.id),false)
FROM product_runs r LEFT JOIN harness_source_generations g ON g.account_id=r.account_id WHERE r.id=run_id
$$;
-- Existing unbound/error records cannot establish content provenance retroactively.
UPDATE product_runs SET input=NULL,output=NULL,objective='',comment='',correction='',selected_text=''
  WHERE NOT product_run_source_available(id);
DELETE FROM product_run_spans WHERE run_id IN (SELECT id FROM product_runs WHERE NOT product_run_source_available(id));
UPDATE product_run_feedback_events SET output='null'::jsonb,comment='',correction='',selected_text=''
  WHERE run_id IN (SELECT id FROM product_runs WHERE NOT product_run_source_available(id));
