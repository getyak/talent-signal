-- Every admitted product run is visible independently of user feedback.
CREATE TABLE product_runs (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  task_id uuid, session_id uuid, platform text NOT NULL, task_kind text NOT NULL,
  objective text NOT NULL, input jsonb, output jsonb, output_hash text,
  status text NOT NULL DEFAULT 'running', attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz, expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  feedback_revision integer NOT NULL DEFAULT 0, sentiment text CHECK(sentiment IN ('helpful','unhelpful')),
  reasons jsonb NOT NULL DEFAULT '[]', comment text NOT NULL DEFAULT '', correction text NOT NULL DEFAULT '',
  selected_text text NOT NULL DEFAULT '', feedback_updated_at timestamptz,
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id)
);
CREATE INDEX product_runs_recent ON product_runs(account_id,user_id,created_at DESC,id DESC);
CREATE INDEX product_runs_task ON product_runs(account_id,user_id,task_id);
CREATE TABLE product_run_spans (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES product_runs(id) ON DELETE CASCADE,
  span jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_run_spans_run ON product_run_spans(run_id,created_at);
CREATE TABLE product_run_feedback_events (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES product_runs(id) ON DELETE CASCADE,
  revision integer NOT NULL, output_hash text NOT NULL, platform text NOT NULL,
  sentiment text, reasons jsonb NOT NULL, comment text NOT NULL, correction text NOT NULL, selected_text text NOT NULL,
  output jsonb NOT NULL, request_hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,revision)
);

ALTER TABLE lab_regressions ADD COLUMN source_run_id uuid REFERENCES product_runs(id);

CREATE FUNCTION product_run_source_available(run_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
SELECT (r.input IS NOT NULL AND r.expires_at>now()
  AND (r.input->'value'->>'previous_task_id' IS NULL OR EXISTS(SELECT 1 FROM product_runs parent
    WHERE parent.account_id=r.account_id AND parent.user_id=r.user_id AND parent.task_id::text=r.input->'value'->>'previous_task_id'
      AND parent.created_at<r.created_at AND product_run_source_available(parent.id)))
  AND (r.task_id IS NULL OR agent_session_chat_sources_available(r.account_id,r.task_id::text))
  AND (r.session_id IS NULL OR EXISTS(SELECT 1 FROM agent_sessions s WHERE s.account_id=r.account_id AND s.created_by_user_id=r.user_id
    AND s.id=r.session_id AND s.deleted_at IS NULL AND s.expires_at>now()))
  AND NOT EXISTS(SELECT 1 FROM context_manifests m WHERE m.account_id=r.account_id AND m.task_id=r.task_id
    AND NOT agent_session_task_available(m.account_id,m.task_id::text,m.subject_id::text,m.assignment_id::text))
  AND NOT EXISTS(SELECT 1 FROM screenshot_contact_tasks t WHERE t.account_id=r.account_id AND t.id=r.task_id
    AND NOT agent_session_screenshot_context_available(r.account_id,t.id))) FROM product_runs r WHERE r.id=run_id
$$;
