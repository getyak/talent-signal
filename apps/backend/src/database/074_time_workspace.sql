-- GET-24 time workspace: a server-owned, account/user-scoped read model over
-- existing sources plus a minimal user-authored internal schedule lifecycle.
--
-- The activity projection never becomes a second source of truth. Every read
-- re-derives content from the current source and re-checks source authority.
-- Snapshots materialize activity identities and ordering keys only; sensitive
-- content stays in the canonical source tables.

-- User-authored internal schedules. This is canonical user intent, not a
-- model interpretation, and it never writes to an external calendar.
-- Deletion redacts content in place while keeping an identity-only receipt and
-- the last operation id for response-loss reconciliation. Cancellation is a
-- normal status transition that retains reviewed content.
CREATE TABLE time_schedules (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  -- Sensitive content. Null only after an explicit delete redaction.
  title text,
  note text,
  kind text,
  person_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  all_day boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('planned','completed','cancelled','deleted')),
  reminder_minutes integer,
  external_effect text NOT NULL CHECK (external_effect = 'none'),
  revision integer NOT NULL CHECK (revision > 0),
  -- Retained across deletion so a lost response can be reconciled.
  last_operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at timestamptz,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, id, created_by_user_id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, person_id) REFERENCES subjects(account_id, id),
  CHECK (reminder_minutes IS NULL OR reminder_minutes IN (0,5,15,30,60)),
  CHECK (kind IS NULL OR kind IN ('meeting','reminder')),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
  CHECK (status <> 'deleted' OR (
    title IS NULL AND note IS NULL AND kind IS NULL AND person_id IS NULL
    AND starts_at IS NULL AND ends_at IS NULL AND time_zone IS NULL
    AND reminder_minutes IS NULL
  )),
  CHECK (status = 'deleted' OR (
    title IS NOT NULL AND note IS NOT NULL AND kind IS NOT NULL
    AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND time_zone IS NOT NULL
    AND ends_at > starts_at AND ends_at - starts_at <= interval '7 days'
  )),
  CHECK (title IS NULL OR (btrim(title) <> '' AND char_length(title) <= 200)),
  CHECK (note IS NULL OR char_length(note) <= 2000),
  CHECK (time_zone IS NULL OR (btrim(time_zone) <> '' AND char_length(time_zone) <= 100))
);
CREATE INDEX time_schedules_owner_idx
  ON time_schedules(account_id, created_by_user_id, starts_at, id);

-- Digests, identities, and results only. Never the sensitive request payload.
CREATE TABLE time_schedule_operations (
  account_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  schedule_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','update','delete')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  resulting_revision integer NOT NULL CHECK (resulting_revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, actor_user_id, idempotency_key),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, schedule_id) REFERENCES time_schedules(account_id, id)
);

-- Active Person / relationship-context binding for a Session. The binding is
-- one identity: both the Person and its relationship context must be currently
-- active and agree, otherwise no person or context metadata is returned. The
-- redaction helper strips withdrawn source-derived narrative before any read,
-- and identity-review Sessions never acquire a person/context binding.
CREATE FUNCTION time_session_person_binding(p_account uuid, p_session uuid)
RETURNS TABLE(person_id uuid, person_label text, context_id uuid, context_label text)
LANGUAGE sql STABLE AS $$
  SELECT
    CASE WHEN person.id IS NOT NULL AND context.id IS NOT NULL THEN person.id END,
    CASE WHEN person.id IS NOT NULL AND context.id IS NOT NULL THEN person.display_label END,
    CASE WHEN person.id IS NOT NULL AND context.id IS NOT NULL THEN context.id END,
    CASE WHEN person.id IS NOT NULL AND context.id IS NOT NULL THEN context.display_label END
  FROM agent_sessions session
  CROSS JOIN LATERAL (
    SELECT redact_agent_session_payload(session.account_id, session.payload) AS body
  ) redacted
  LEFT JOIN subjects person
    ON person.account_id = session.account_id
   AND person.status = 'active'
   AND redacted.body->>'scopeKind' = 'relationship'
   AND person.id = CASE
     WHEN (redacted.body->>'personID') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (redacted.body->>'personID')::uuid END
  LEFT JOIN assignments context
    ON context.account_id = session.account_id
   AND context.status = 'active'
   AND context.subject_id = person.id
   AND context.id = CASE
     WHEN (redacted.body->>'relationshipContextID') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (redacted.body->>'relationshipContextID')::uuid END
  WHERE session.account_id = p_account AND session.id = p_session
$$;

-- Canonical activity projection. Returns index metadata for one bounded local
-- date range in one explicit IANA zone. It is a read model: person/context
-- labels are live-validated, Session turns are grouped by their actual
-- createdAt local date (not session.updated_at), and withdrawn drafts are
-- excluded. Session titles/summaries are generic and built only from the
-- currently active validated Person label plus a turn count, so an old or
-- withdrawn Session narrative can never leak. JSON casts are guarded so an
-- invalid stored timestamp can never abort the projection.
CREATE FUNCTION time_activity_content(
  p_account uuid,
  p_user uuid,
  p_from date,
  p_to date,
  p_tz text,
  p_person uuid DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
) RETURNS TABLE (
  activity_id text,
  kind text,
  source_id uuid,
  source_revision integer,
  title text,
  summary text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  ends_at timestamptz,
  local_day date,
  person_id uuid,
  person_label text,
  relationship_context_id uuid,
  context_label text,
  session_id uuid,
  status text,
  authority text,
  all_day boolean
) LANGUAGE sql STABLE AS $fn$
  WITH session_days AS (
    SELECT
      session.id AS session_id,
      session.revision AS source_revision,
      session.created_at AS recorded_at,
      CASE WHEN binding.person_label IS NOT NULL
        THEN '会话活动 · ' || binding.person_label
        ELSE '会话活动' END AS title,
      binding.person_id,
      binding.person_label,
      binding.context_id AS relationship_context_id,
      binding.context_label,
      (turn_at.occurred_at AT TIME ZONE p_tz)::date AS local_day,
      MIN(turn_at.occurred_at) AS occurred_at,
      COUNT(*)::int AS turn_count
    FROM agent_sessions session
    CROSS JOIN LATERAL (
      SELECT redact_agent_session_payload(session.account_id, session.payload) AS body
    ) redacted
    LEFT JOIN LATERAL time_session_person_binding(p_account, session.id) binding ON TRUE
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(redacted.body->'turns') = 'array'
        THEN redacted.body->'turns' ELSE '[]'::jsonb END
    ) AS turn(value)
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(turn.value->'createdAt') = 'string'
          AND (turn.value->>'createdAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
          AND pg_input_is_valid(turn.value->>'createdAt', 'timestamptz')
        THEN (turn.value->>'createdAt')::timestamptz
      END AS occurred_at
    ) turn_at
    WHERE session.account_id = p_account
      AND session.created_by_user_id = p_user
      AND session.deleted_at IS NULL
      AND session.expires_at > statement_timestamp()
      AND session.payload IS NOT NULL
      AND turn_at.occurred_at IS NOT NULL
      AND (p_ids IS NULL OR session.id = ANY(p_ids))
    GROUP BY session.id, session.revision, session.created_at,
      binding.person_id, binding.person_label,
      binding.context_id, binding.context_label,
      (turn_at.occurred_at AT TIME ZONE p_tz)::date
  )
  SELECT
    'session_activity:' || session_days.session_id::text || ':' || to_char(session_days.local_day, 'YYYY-MM-DD'),
    'session_activity'::text,
    session_days.session_id,
    session_days.source_revision,
    session_days.title,
    session_days.turn_count::text || ' 条当日会话记录',
    session_days.occurred_at,
    session_days.recorded_at,
    NULL::timestamptz,
    session_days.local_day,
    session_days.person_id,
    session_days.person_label,
    session_days.relationship_context_id,
    session_days.context_label,
    session_days.session_id,
    'recorded'::text,
    'system_record'::text,
    false
  FROM session_days
  WHERE session_days.local_day >= p_from AND session_days.local_day < p_to
    AND (p_kind IS NULL OR p_kind = 'session_activity')
    AND (p_person IS NULL OR session_days.person_id = p_person)
    AND (p_ids IS NULL OR session_days.session_id = ANY(p_ids))
  UNION ALL
  SELECT
    'person_created:' || subject.id::text,
    'person_created'::text,
    subject.id,
    1,
    subject.display_label,
    '新建人物',
    subject.created_at,
    subject.created_at,
    NULL::timestamptz,
    (subject.created_at AT TIME ZONE p_tz)::date,
    subject.id,
    subject.display_label,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    'recorded'::text,
    'system_record'::text,
    false
  FROM subjects subject
  WHERE subject.account_id = p_account
    AND subject.status = 'active'
    AND (subject.created_at AT TIME ZONE p_tz)::date >= p_from
    AND (subject.created_at AT TIME ZONE p_tz)::date < p_to
    AND (p_kind IS NULL OR p_kind = 'person_created')
    AND (p_person IS NULL OR subject.id = p_person)
    AND (p_ids IS NULL OR subject.id = ANY(p_ids))
  UNION ALL
  SELECT
    'meeting_draft:' || draft.id::text,
    'meeting_draft'::text,
    draft.id,
    draft.revision,
    draft.title,
    '未经确认的日程草稿'::text,
    draft.starts_at,
    draft.created_at,
    draft.ends_at,
    GREATEST((draft.starts_at AT TIME ZONE p_tz)::date, p_from),
    binding.person_id,
    binding.person_label,
    binding.context_id,
    binding.context_label,
    draft.origin_session_id,
    'needs_review'::text,
    'unconfirmed'::text,
    false
  FROM meeting_drafts draft
  LEFT JOIN LATERAL time_session_person_binding(p_account, draft.origin_session_id) binding ON TRUE
  WHERE draft.account_id = p_account
    AND draft.created_by_user_id = p_user
    AND draft.status = 'needs_review'
    AND draft.expires_at > statement_timestamp()
    AND meeting_draft_source_available(
      draft.account_id, draft.origin_session_id, draft.source_task_id
    )
    AND draft.starts_at < (p_to::timestamp AT TIME ZONE p_tz)
    AND draft.ends_at > (p_from::timestamp AT TIME ZONE p_tz)
    AND (p_kind IS NULL OR p_kind = 'meeting_draft')
    AND (p_person IS NULL OR binding.person_id = p_person)
    AND (p_ids IS NULL OR draft.id = ANY(p_ids))
  UNION ALL
  SELECT
    'schedule:' || schedule.id::text,
    'schedule'::text,
    schedule.id,
    schedule.revision,
    schedule.title,
    left(COALESCE(schedule.note, ''), 1000),
    schedule.starts_at,
    schedule.created_at,
    schedule.ends_at,
    GREATEST((schedule.starts_at AT TIME ZONE p_tz)::date, p_from),
    person.id,
    person.display_label,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    schedule.status,
    'user_authored'::text,
    schedule.all_day
  FROM time_schedules schedule
  LEFT JOIN subjects person
    ON person.account_id = schedule.account_id
   AND person.status = 'active'
   AND person.id = schedule.person_id
  WHERE schedule.account_id = p_account
    AND schedule.created_by_user_id = p_user
    AND schedule.status <> 'deleted'
    AND schedule.starts_at < (p_to::timestamp AT TIME ZONE p_tz)
    AND schedule.ends_at > (p_from::timestamp AT TIME ZONE p_tz)
    AND (p_kind IS NULL OR p_kind = 'schedule')
    AND (p_person IS NULL OR person.id = p_person)
    AND (p_ids IS NULL OR schedule.id = ANY(p_ids))
$fn$;

-- Short-lived list snapshots materialize activity identities and immutable
-- ordering keys only. The scope fingerprint binds the cursor to one exact
-- account/owner/scope so a cursor cannot switch scope. Sensitive content is
-- re-read from canonical sources on every page.
CREATE TABLE time_activity_snapshots (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  scope_fingerprint text NOT NULL CHECK (scope_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, created_by_user_id) REFERENCES users(account_id, id),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '10 minutes')
);
CREATE INDEX time_activity_snapshots_expiry_idx ON time_activity_snapshots(expires_at);
CREATE INDEX time_activity_snapshots_owner_idx
  ON time_activity_snapshots(account_id, created_by_user_id, created_at);

CREATE TABLE time_activity_snapshot_items (
  account_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  activity_id text NOT NULL CHECK (char_length(activity_id) BETWEEN 1 AND 150),
  kind text NOT NULL CHECK (kind IN ('person_created','session_activity','meeting_draft','schedule')),
  source_id uuid NOT NULL,
  local_day date NOT NULL,
  sort_micros bigint NOT NULL,
  PRIMARY KEY (account_id, snapshot_id, activity_id),
  FOREIGN KEY (account_id, snapshot_id)
    REFERENCES time_activity_snapshots(account_id, id) ON DELETE CASCADE
);
CREATE INDEX time_activity_snapshot_items_page_idx
  ON time_activity_snapshot_items(
    account_id, snapshot_id, sort_micros DESC, activity_id DESC
  );

INSERT INTO lab_test_workspace_table_manifest(table_name,scope)
VALUES
  ('time_schedules','account'),
  ('time_schedule_operations','account'),
  ('time_activity_snapshots','account'),
  ('time_activity_snapshot_items','account');
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON time_schedules
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON time_schedule_operations
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON time_activity_snapshots
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
CREATE TRIGGER lab_test_workspace_write_guard
  BEFORE INSERT OR UPDATE ON time_activity_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
