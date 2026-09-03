CREATE TABLE lab_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  started_by_user_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  scenario_id text NOT NULL CHECK (
    scenario_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  scenario_revision text NOT NULL CHECK (length(btrim(scenario_revision)) > 0),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  workspace_ref text NOT NULL CHECK (workspace_ref ~ '^lab_[a-f0-9]{12}$'),
  environment text NOT NULL CHECK (environment = 'FAT'),
  tester_identity text NOT NULL CHECK (length(btrim(tester_identity)) > 0),
  status text NOT NULL CHECK (status IN ('active', 'expired', 'closed')),
  active_envelope jsonb NOT NULL CHECK (jsonb_typeof(active_envelope) = 'object'),
  canonical_isolation boolean NOT NULL CHECK (canonical_isolation = true),
  production_data_access boolean NOT NULL CHECK (production_data_access = false),
  write_boundary text NOT NULL CHECK (write_boundary = 'lab_only'),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, workspace_ref),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, started_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  CHECK (expires_at > started_at),
  CHECK (
    (status = 'active' AND closed_at IS NULL)
    OR (status IN ('expired', 'closed') AND closed_at IS NOT NULL)
  )
);

CREATE INDEX lab_sessions_active_user_idx
  ON lab_sessions(account_id, started_by_user_id, started_at DESC)
  WHERE status = 'active';

CREATE TABLE lab_runs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  scenario_id text NOT NULL,
  scenario_revision text NOT NULL,
  variant text NOT NULL CHECK (variant IN ('baseline', 'candidate')),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  output_hash text NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  version_envelope jsonb NOT NULL CHECK (jsonb_typeof(version_envelope) = 'object'),
  output jsonb NOT NULL CHECK (jsonb_typeof(output) = 'object'),
  trace_id text NOT NULL CHECK (trace_id ~ '^[a-f0-9]{32}$'),
  deterministic boolean NOT NULL CHECK (deterministic = true),
  canonical_revision_before integer NOT NULL CHECK (canonical_revision_before = 0),
  canonical_revision_after integer NOT NULL CHECK (canonical_revision_after = 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_record_id),
  UNIQUE (account_id, trace_id),
  FOREIGN KEY (account_id, session_id) REFERENCES lab_sessions(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id),
  CHECK (canonical_revision_before = canonical_revision_after)
);

CREATE INDEX lab_runs_session_created_idx
  ON lab_runs(account_id, session_id, created_at DESC, id);

CREATE TABLE lab_comparisons (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  baseline_run_id uuid NOT NULL,
  candidate_run_id uuid NOT NULL,
  identical_snapshot boolean NOT NULL CHECK (identical_snapshot = true),
  differences jsonb NOT NULL CHECK (jsonb_typeof(differences) = 'array'),
  improved_count integer NOT NULL CHECK (improved_count >= 0),
  regressed_count integer NOT NULL CHECK (regressed_count >= 0),
  changed_count integer NOT NULL CHECK (changed_count >= 0),
  canonical_mutation_count integer NOT NULL CHECK (canonical_mutation_count = 0),
  external_effect_count integer NOT NULL CHECK (external_effect_count = 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, session_id) REFERENCES lab_sessions(account_id, id),
  FOREIGN KEY (account_id, baseline_run_id) REFERENCES lab_runs(account_id, id),
  FOREIGN KEY (account_id, candidate_run_id) REFERENCES lab_runs(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  CHECK (baseline_run_id <> candidate_run_id)
);

CREATE TABLE lab_reality_receipts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  session_id uuid NOT NULL,
  run_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  display_ref text NOT NULL CHECK (display_ref ~ '^RR-[A-F0-9]{8}$'),
  scenario_id text NOT NULL,
  scenario_revision text NOT NULL,
  expected text NOT NULL CHECK (length(btrim(expected)) > 0),
  actual text NOT NULL CHECK (length(btrim(actual)) > 0),
  issue_summary text NOT NULL CHECK (length(btrim(issue_summary)) > 0),
  surface_path text NOT NULL CHECK (length(btrim(surface_path)) > 0),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  output_hash text NOT NULL CHECK (output_hash ~ '^[a-f0-9]{64}$'),
  version_envelope jsonb NOT NULL CHECK (jsonb_typeof(version_envelope) = 'object'),
  trace_id text NOT NULL CHECK (trace_id ~ '^[a-f0-9]{32}$'),
  canonical_revision integer NOT NULL CHECK (canonical_revision = 0),
  reproduced boolean NOT NULL,
  screenshot_state text NOT NULL CHECK (
    screenshot_state = 'redacted_surface_snapshot'
  ),
  redacted_surface_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(redacted_surface_snapshot) = 'object'
  ),
  redaction_applied boolean NOT NULL CHECK (redaction_applied = true),
  status text NOT NULL CHECK (status IN ('recorded', 'promoted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, display_ref),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, session_id) REFERENCES lab_sessions(account_id, id),
  FOREIGN KEY (account_id, run_id) REFERENCES lab_runs(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, trace_id)
    REFERENCES telemetry_traces(account_id, trace_id),
  CHECK (
    (status = 'recorded' AND promoted_at IS NULL)
    OR (status = 'promoted' AND promoted_at IS NOT NULL)
  )
);

CREATE INDEX lab_reality_receipts_session_idx
  ON lab_reality_receipts(account_id, session_id, created_at DESC);

CREATE TABLE lab_eval_cases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  source_receipt_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  case_ref text NOT NULL CHECK (case_ref ~ '^LAB-[A-F0-9]{8}$'),
  version integer NOT NULL CHECK (version > 0),
  scenario_id text NOT NULL,
  scenario_revision text NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  expected_behavior text NOT NULL CHECK (length(btrim(expected_behavior)) > 0),
  observed_regression text NOT NULL CHECK (length(btrim(observed_regression)) > 0),
  partition text NOT NULL CHECK (partition = 'dev'),
  lifecycle text NOT NULL CHECK (lifecycle = 'active'),
  adjudication text NOT NULL CHECK (adjudication = 'human_gold'),
  release_gate text NOT NULL CHECK (release_gate = 'candidate_blocking'),
  reviewer_note text NOT NULL CHECK (length(btrim(reviewer_note)) >= 10),
  promoted_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, case_ref),
  UNIQUE (account_id, source_receipt_id),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, source_receipt_id)
    REFERENCES lab_reality_receipts(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, promoted_by_user_id)
    REFERENCES users(account_id, id)
);

-- Lab quality-control state must never gain direct ownership of product truth.
-- Deliberately absent: foreign keys to subjects, pursuits, captures, evidence,
-- confirmed state, proposals, actions, effects, outcomes, or external systems.
