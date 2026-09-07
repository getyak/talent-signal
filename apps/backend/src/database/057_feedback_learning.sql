-- Purpose-bound, owner-scoped original product executions for the private learning loop.
-- Feedback remains a proposal. Neither storage nor replay grants business-write authority.
CREATE TABLE feedback_execution_snapshots (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  task_id uuid NOT NULL, session_id uuid NOT NULL, manifest_id uuid NOT NULL,
  person_id uuid NOT NULL, relationship_context_id uuid NOT NULL,
  snapshot jsonb, content_hash text NOT NULL, output_hash text NOT NULL,
  source_state text NOT NULL DEFAULT 'available' CHECK (source_state IN
    ('available','source_deleted','source_expired','wrong_identity','source_unavailable')),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  UNIQUE(account_id,user_id,task_id),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id),
  FOREIGN KEY(account_id,session_id) REFERENCES agent_sessions(account_id,id),
  CHECK (expires_at<=created_at+interval '7 days'),
  CHECK (snapshot IS NULL OR octet_length(snapshot::text)<=262144)
);
CREATE INDEX feedback_execution_expiry ON feedback_execution_snapshots(expires_at) WHERE snapshot IS NOT NULL;
CREATE TABLE product_feedback (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  session_id uuid NOT NULL, turn_id uuid NOT NULL, execution_id uuid NOT NULL REFERENCES feedback_execution_snapshots(id),
  revision integer NOT NULL CHECK (revision>0), category text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','withdrawn')), expected_behavior_proposal text,
  regression_id uuid REFERENCES lab_regressions(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id),
  FOREIGN KEY(account_id,session_id) REFERENCES agent_sessions(account_id,id),
  CHECK (category IN ('fact_error','wrong_identity','wrong_time','unsupported_suggestion','preference','later_change','helpful','unhelpful','click')),
  CHECK (expected_behavior_proposal IS NULL OR length(expected_behavior_proposal)<=2000)
);
CREATE TABLE product_feedback_operations (
  account_id uuid NOT NULL, user_id uuid NOT NULL, idempotency_key uuid NOT NULL,
  feedback_id uuid NOT NULL REFERENCES product_feedback(id), request_hash text NOT NULL, resulting_revision integer NOT NULL,
  PRIMARY KEY(account_id,user_id,idempotency_key), FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id)
);
CREATE TABLE product_feedback_observations (
  id uuid PRIMARY KEY, account_id uuid NOT NULL, user_id uuid NOT NULL,
  feedback_id uuid NOT NULL REFERENCES product_feedback(id), feedback_revision integer NOT NULL,
  original_execution_id uuid NOT NULL REFERENCES feedback_execution_snapshots(id),
  later_execution_id uuid NOT NULL REFERENCES feedback_execution_snapshots(id),
  idempotency_key uuid NOT NULL, request_hash text NOT NULL, record jsonb NOT NULL,
  followup_regression_id uuid REFERENCES lab_regressions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,user_id,idempotency_key),
  UNIQUE(feedback_id,feedback_revision,later_execution_id),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id)
);
ALTER TABLE lab_regressions DROP CONSTRAINT lab_regressions_snapshot_check;
ALTER TABLE lab_regressions ADD CONSTRAINT lab_regressions_data_class CHECK
  (snapshot IS NULL OR snapshot->>'data_class' IN ('registered_synthetic','private_business'));
ALTER TABLE lab_regressions ADD COLUMN source_execution_id uuid REFERENCES feedback_execution_snapshots(id);
ALTER TABLE lab_regressions ADD COLUMN source_feedback_id uuid REFERENCES product_feedback(id);

CREATE FUNCTION feedback_execution_source_state(execution uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN e.source_state<>'available' THEN e.source_state
    WHEN e.expires_at<=statement_timestamp() OR s.expires_at<=statement_timestamp() THEN 'source_expired'
    WHEN s.deleted_at IS NOT NULL OR s.id IS NULL THEN 'source_deleted'
    WHEN EXISTS (SELECT 1 FROM context_manifest_evidence me
      JOIN evidence_fragments f ON f.account_id=me.account_id AND f.id=me.evidence_fragment_id
      JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
      JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
      WHERE me.account_id=e.account_id AND me.manifest_id=e.manifest_id
        AND (c.subject_id IS DISTINCT FROM e.person_id OR c.assignment_id IS DISTINCT FROM e.relationship_context_id)) THEN 'wrong_identity'
    WHEN NOT agent_session_task_available(e.account_id,e.task_id::text,e.person_id::text,e.relationship_context_id::text)
      OR NOT agent_session_chat_sources_available(e.account_id,e.task_id::text) THEN 'source_unavailable'
    WHEN e.snapshot IS NULL THEN 'source_unavailable'
    ELSE 'available' END
  FROM feedback_execution_snapshots e LEFT JOIN agent_sessions s ON s.account_id=e.account_id
    AND s.id=e.session_id AND s.created_by_user_id=e.user_id WHERE e.id=execution
$$;

-- All descendants and in-flight runs lose content in the same source transition.
CREATE FUNCTION retract_feedback_learning(account uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE gone uuid[]; jobs uuid[];
BEGIN
  UPDATE feedback_execution_snapshots e SET source_state=feedback_execution_source_state(e.id),snapshot=NULL
    WHERE e.account_id=account AND e.snapshot IS NOT NULL AND feedback_execution_source_state(e.id)<>'available';
  UPDATE product_feedback f SET expected_behavior_proposal=NULL
    WHERE f.account_id=account AND f.expected_behavior_proposal IS NOT NULL
      AND (f.status='withdrawn' OR feedback_execution_source_state(f.execution_id)<>'available');
  WITH RECURSIVE tree AS (
    SELECT r.id FROM lab_regressions r LEFT JOIN product_feedback f ON f.id=r.source_feedback_id
      WHERE r.account_id=account AND r.deleted_at IS NULL AND r.source_execution_id IS NOT NULL
      AND (feedback_execution_source_state(r.source_execution_id)<>'available' OR feedback_execution_source_state(f.execution_id)<>'available' OR f.status='withdrawn'
        OR (r.snapshot->'feedback_source'->>'feedback_revision')::integer IS DISTINCT FROM f.revision)
    UNION SELECT r.id FROM lab_regressions r JOIN tree ON r.parent_id=tree.id WHERE r.account_id=account
  ) SELECT array_agg(id) INTO gone FROM tree;
  IF gone IS NULL THEN RETURN; END IF;
  WITH affected AS (UPDATE lab_experiment_jobs SET expires_at=LEAST(expires_at,now()),
    status=CASE WHEN status IN ('queued','running','cancelling') THEN 'unknown' ELSE status END,
    lease_id=NULL,lease_expires_at=NULL,definition=jsonb_set(definition,'{cases}','[]')
    WHERE account_id=account AND regression_id=ANY(gone) RETURNING id)
    SELECT array_agg(id) INTO jobs FROM affected;
  DELETE FROM lab_experiment_attempts WHERE job_id=ANY(jobs);
  UPDATE lab_ci_verifications SET receipt=NULL WHERE regression_id=ANY(gone);
  UPDATE lab_regressions SET snapshot=NULL,deleted_at=COALESCE(deleted_at,now()),
    deleted_job_ids=ARRAY(SELECT DISTINCT unnest(deleted_job_ids || COALESCE(jobs,'{}'::uuid[])) ORDER BY 1)
    WHERE id=ANY(gone);
END;
$$;
CREATE FUNCTION invalidate_feedback_learning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM retract_feedback_learning(NEW.account_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_feedback_evidence AFTER UPDATE OF text_content,status,review_status,attribution_status,attributed_actor ON evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_authorization AFTER UPDATE OF source_access_state,authorization_state,authorization_expires_at ON source_retention_receipts
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_capture AFTER UPDATE OF status,subject_id,assignment_id ON captures
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_manifest AFTER UPDATE OF status ON context_manifests
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_snapshot AFTER UPDATE OF status ON knowledge_snapshots
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_session AFTER UPDATE OF payload,deleted_at,expires_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_screenshot AFTER UPDATE OF status,expires_at,capture_id ON screenshot_contact_tasks
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_resource AFTER UPDATE OF processing_state ON source_resources
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_person AFTER UPDATE OF status ON subjects
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
CREATE TRIGGER zz_feedback_context AFTER UPDATE OF status ON assignments
  FOR EACH ROW EXECUTE FUNCTION invalidate_feedback_learning();
