CREATE TABLE telemetry_traces (
  account_id uuid NOT NULL,
  trace_id text NOT NULL CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  root_span_id text NOT NULL CHECK (root_span_id ~ '^[0-9a-f]{16}$'),
  interaction_id uuid NOT NULL,
  user_id uuid NOT NULL,
  session_hash text NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  name text NOT NULL,
  surface text NOT NULL CHECK (
    surface IN ('web', 'ios', 'browser_extension', 'backend', 'evaluation')
  ),
  route text NOT NULL,
  environment text NOT NULL,
  data_classification text NOT NULL CHECK (
    data_classification IN ('synthetic', 'private_relationship', 'operational')
  ),
  content_capture_status text NOT NULL CHECK (
    content_capture_status IN (
      'none', 'reference_only', 'full', 'mixed', 'redacted'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('running', 'ok', 'error', 'cancelled')
  ),
  error_code text,
  safe_attributes jsonb NOT NULL CHECK (jsonb_typeof(safe_attributes) = 'object'),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, trace_id),
  UNIQUE (account_id, interaction_id),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id),
  CHECK (
    (status = 'running' AND ended_at IS NULL)
    OR (status <> 'running' AND ended_at IS NOT NULL)
  )
);

CREATE INDEX telemetry_traces_recent_idx
  ON telemetry_traces(account_id, started_at DESC, trace_id);

CREATE INDEX telemetry_traces_status_idx
  ON telemetry_traces(account_id, status, started_at DESC);

CREATE TABLE telemetry_artifacts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  trace_id text NOT NULL,
  interaction_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0 AND ordinal < 50),
  kind text NOT NULL CHECK (
    kind IN ('text', 'image', 'document', 'audio', 'json', 'other')
  ),
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size >= 0 AND byte_size <= 5242880),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  capture_status text NOT NULL CHECK (
    capture_status IN (
      'reference_only', 'governed_full', 'minimized_derivative', 'redacted'
    )
  ),
  purpose text NOT NULL,
  authorization_scope text NOT NULL,
  text_content text,
  binary_content bytea,
  governed_source_ref text,
  retention_expires_at timestamptz NOT NULL,
  deletion_state text NOT NULL DEFAULT 'active' CHECK (
    deletion_state IN ('active', 'revoked', 'deleted')
  ),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, trace_id, ordinal),
  UNIQUE (account_id, trace_id, id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id),
  CHECK (
    (capture_status IN ('governed_full', 'minimized_derivative')
      AND num_nonnulls(text_content, binary_content, governed_source_ref) = 1)
    OR
    (capture_status IN ('reference_only', 'redacted')
      AND num_nonnulls(text_content, binary_content) = 0)
  )
);

CREATE INDEX telemetry_artifacts_retention_idx
  ON telemetry_artifacts(account_id, retention_expires_at)
  WHERE deletion_state = 'active';

CREATE TABLE telemetry_spans (
  account_id uuid NOT NULL,
  trace_id text NOT NULL,
  span_id text NOT NULL CHECK (span_id ~ '^[0-9a-f]{16}$'),
  parent_span_id text CHECK (
    parent_span_id IS NULL OR parent_span_id ~ '^[0-9a-f]{16}$'
  ),
  name text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('internal', 'client', 'server', 'producer', 'consumer')
  ),
  status text NOT NULL CHECK (status IN ('unset', 'ok', 'error')),
  safe_attributes jsonb NOT NULL CHECK (jsonb_typeof(safe_attributes) = 'object'),
  artifact_refs uuid[] NOT NULL DEFAULT '{}',
  agent_run_id uuid,
  agent_event_sequence integer CHECK (
    agent_event_sequence IS NULL OR agent_event_sequence > 0
  ),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, trace_id, span_id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id),
  FOREIGN KEY (account_id, agent_run_id)
    REFERENCES agent_runs(account_id, id),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX telemetry_spans_agent_run_idx
  ON telemetry_spans(account_id, agent_run_id, agent_event_sequence)
  WHERE agent_run_id IS NOT NULL;

CREATE TABLE telemetry_events (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  trace_id text NOT NULL,
  span_id text,
  name text NOT NULL,
  safe_attributes jsonb NOT NULL CHECK (jsonb_typeof(safe_attributes) = 'object'),
  artifact_refs uuid[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, trace_id, id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id)
);

CREATE INDEX telemetry_events_trace_time_idx
  ON telemetry_events(account_id, trace_id, occurred_at, id);

CREATE TABLE eval_annotations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  trace_id text NOT NULL,
  span_id text,
  evaluator_type text NOT NULL CHECK (
    evaluator_type IN ('deterministic', 'human', 'model', 'outcome')
  ),
  evaluator_name text NOT NULL,
  evaluator_version text NOT NULL,
  verdict text NOT NULL CHECK (
    verdict IN ('pass', 'fail', 'abstain', 'needs_review')
  ),
  score double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  explanation text,
  evidence_refs uuid[] NOT NULL DEFAULT '{}',
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (account_id, trace_id, id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX eval_annotations_trace_idx
  ON eval_annotations(account_id, trace_id, created_at DESC);

ALTER TABLE agent_runs
  ADD COLUMN telemetry_trace_id text,
  ADD COLUMN telemetry_parent_span_id text,
  ADD COLUMN interaction_id uuid;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_telemetry_trace_fk
  FOREIGN KEY (account_id, telemetry_trace_id)
  REFERENCES telemetry_traces(account_id, trace_id);

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_telemetry_parent_span_check
  CHECK (
    telemetry_parent_span_id IS NULL
    OR telemetry_parent_span_id ~ '^[0-9a-f]{16}$'
  );
