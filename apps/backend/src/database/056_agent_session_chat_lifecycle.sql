-- Only Chat tasks explicitly bound to a canonical Session enter this policy.
-- Legacy tasks without session_id retain their existing lifecycle.
CREATE TABLE agent_session_chat_tasks (
  account_id uuid NOT NULL,
  task_id text NOT NULL,
  actor_user_id uuid NOT NULL,
  origin_session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id,task_id),
  FOREIGN KEY (account_id,actor_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id,origin_session_id) REFERENCES agent_sessions(account_id,id),
  CHECK (expires_at<=created_at+interval '30 days')
);
CREATE INDEX agent_session_chat_task_expiry_idx ON agent_session_chat_tasks(expires_at);

INSERT INTO agent_session_chat_tasks(account_id,task_id,actor_user_id,origin_session_id,created_at,expires_at)
  SELECT e.account_id,CASE WHEN e.event_type='unscoped_chat_task.completed' THEN e.entity_id::text ELSE e.metadata->>'task_id' END,
    e.actor_user_id,s.id,e.occurred_at,LEAST(s.expires_at,e.occurred_at+interval '30 days')
  FROM audit_events e JOIN agent_sessions s ON s.account_id=e.account_id AND s.created_by_user_id=e.actor_user_id
    AND s.id=CASE WHEN (e.metadata->>'conversation_session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (e.metadata->>'conversation_session_id')::uuid ELSE NULL END
  WHERE e.event_type IN ('unscoped_chat_task.completed','chat_task.assembled')
    AND (e.event_type='unscoped_chat_task.completed' OR e.metadata->>'task_id' IS NOT NULL)
  ON CONFLICT DO NOTHING;

-- Existing GET-5 follow-ups inherit the oldest retained input clock as well.
-- Audit references were written by the canonical loader, never client blocks.
DO $$
DECLARE affected integer;
BEGIN
  LOOP
    WITH inherited AS (
      SELECT child.account_id,child.task_id,MIN(parent.expires_at) AS expires_at
      FROM audit_events e JOIN agent_session_chat_tasks child ON child.account_id=e.account_id
        AND child.actor_user_id=e.actor_user_id
        AND child.task_id=CASE WHEN e.event_type='unscoped_chat_task.completed' THEN e.entity_id::text ELSE e.metadata->>'task_id' END
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e.metadata->'conversation_message_ids','[]'::jsonb)) message(id)
      JOIN agent_session_chat_tasks parent ON parent.account_id=child.account_id AND parent.actor_user_id=child.actor_user_id
        AND parent.task_id=canonical_agent_session_id(message.id)
      WHERE e.event_type IN ('unscoped_chat_task.completed','chat_task.assembled')
      GROUP BY child.account_id,child.task_id
    )
    UPDATE agent_session_chat_tasks child SET expires_at=inherited.expires_at FROM inherited
      WHERE child.account_id=inherited.account_id AND child.task_id=inherited.task_id AND child.expires_at>inherited.expires_at;
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected=0;
  END LOOP;
END;
$$;

CREATE FUNCTION agent_session_chat_task_available(account uuid, task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (SELECT 1 FROM agent_session_chat_tasks t WHERE t.account_id=account AND t.task_id=canonical_agent_session_id(task)
    AND (t.expires_at<=statement_timestamp() OR NOT EXISTS (
      SELECT 1 FROM agent_sessions s WHERE s.account_id=t.account_id AND s.created_by_user_id=t.actor_user_id
        AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()
        AND (s.id=t.origin_session_id OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.payload->'turns','[]'::jsonb)) turn
          WHERE canonical_agent_session_id(turn->'response'->>'taskID')=t.task_id)))))
$$;

CREATE OR REPLACE FUNCTION agent_session_chat_sources_available(account uuid, task text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT agent_session_chat_task_available(account,task)
    AND NOT EXISTS (SELECT 1 FROM agent_session_retracted_tasks r WHERE r.account_id=account AND r.task_id=canonical_agent_session_id(task))
    AND NOT EXISTS (SELECT 1 FROM agent_session_chat_sources d
      LEFT JOIN screenshot_contact_tasks t ON t.account_id=d.account_id AND t.id=d.screenshot_task_id
      WHERE d.account_id=account AND d.task_id=canonical_agent_session_id(task)
      AND (t.id IS NULL OR t.created_by_user_id<>d.actor_user_id
        OR NOT agent_session_screenshot_context_available(account,t.id)
        OR agent_session_screenshot_fingerprint(t)<>d.source_fingerprint))
$$;

CREATE FUNCTION purge_agent_session_chat_tasks(account uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO agent_session_retracted_tasks(account_id,task_id)
    SELECT t.account_id,t.task_id FROM agent_session_chat_tasks t
    WHERE t.account_id=account AND NOT agent_session_chat_task_available(account,t.task_id)
    ON CONFLICT DO NOTHING;
  UPDATE idempotency_records i SET response_body=jsonb_build_object('task_id',i.response_body->>'task_id','session_context_unavailable',true)
    WHERE i.account_id=account AND i.operation_scope IN ('create_chat_task','create_unscoped_chat_task')
      AND i.response_body IS NOT NULL AND NOT COALESCE((i.response_body->>'session_context_unavailable')::boolean,false)
      AND EXISTS (SELECT 1 FROM agent_session_chat_tasks t WHERE t.account_id=account AND t.task_id=i.response_body->>'task_id')
      AND NOT agent_session_chat_sources_available(account,i.response_body->>'task_id');
  UPDATE agent_sessions SET payload=redact_agent_session_payload(account,payload),revision=revision+1,updated_at=now()
    WHERE account_id=account AND deleted_at IS NULL AND payload IS DISTINCT FROM redact_agent_session_payload(account,payload);
END;
$$;
CREATE FUNCTION invalidate_agent_session_chat_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM purge_agent_session_chat_tasks(NEW.account_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_session_chat_lifecycle AFTER UPDATE OF payload,deleted_at,expires_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION invalidate_agent_session_chat_lifecycle();

SELECT purge_agent_session_chat_tasks(account_id) FROM (SELECT DISTINCT account_id FROM agent_session_chat_tasks) owners;
