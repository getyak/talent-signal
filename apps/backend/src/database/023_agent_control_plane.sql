CREATE TABLE agent_runs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  objective text NOT NULL,
  base_revision integer NOT NULL CHECK (base_revision > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  provider_id text NOT NULL,
  model text NOT NULL,
  sdk_version text NOT NULL,
  budget jsonb NOT NULL CHECK (jsonb_typeof(budget) = 'object'),
  context_manifest jsonb NOT NULL CHECK (
    jsonb_typeof(context_manifest) = 'object'
  ),
  fingerprints jsonb NOT NULL CHECK (
    jsonb_typeof(fingerprints) = 'object'
    AND fingerprints ?& ARRAY[
      'definition', 'system_prompt', 'tool_manifest', 'sdk',
      'model', 'policy', 'contract', 'context'
    ]
  ),
  status text NOT NULL CHECK (
    status IN (
      'starting', 'running', 'proposal_staged', 'no_action',
      'quarantined', 'budget_exhausted', 'cancelled', 'failed'
    )
  ),
  usage jsonb NOT NULL DEFAULT '{
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "estimated_usd": 0,
    "turns": 0,
    "tool_calls": 0,
    "duration_ms": 0
  }'::jsonb CHECK (jsonb_typeof(usage) = 'object'),
  terminal_receipt jsonb,
  provider_session_id text,
  external_effects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    external_effects = '[]'::jsonb
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, user_id) REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, pursuit_id) REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  CHECK (
    (status IN ('starting', 'running')
      AND terminal_receipt IS NULL
      AND completed_at IS NULL)
    OR
    (status NOT IN ('starting', 'running')
      AND terminal_receipt IS NOT NULL
      AND completed_at IS NOT NULL)
  )
);

CREATE INDEX agent_runs_scope_idx
  ON agent_runs(account_id, pursuit_id, created_at DESC);

CREATE TABLE agent_run_evidence (
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  fragment_id uuid NOT NULL,
  manifest_order integer NOT NULL CHECK (manifest_order >= 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  inclusion_reason text NOT NULL,
  authorization_scope text NOT NULL,
  snapshot_authority text NOT NULL CHECK (snapshot_authority = 'available'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, run_id, fragment_id),
  UNIQUE (account_id, run_id, manifest_order),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id),
  FOREIGN KEY (account_id, fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE INDEX agent_run_evidence_fragment_idx
  ON agent_run_evidence(account_id, fragment_id, run_id);

CREATE TABLE agent_run_events (
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  event_kind text NOT NULL CHECK (
    event_kind IN ('tool_call', 'provider_result', 'terminal')
  ),
  tool_name text,
  status text NOT NULL,
  input_fingerprint text CHECK (
    input_fingerprint IS NULL OR input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  output_fingerprint text CHECK (
    output_fingerprint IS NULL OR output_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, run_id, sequence),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id)
);

CREATE TABLE agent_tool_calls (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence integer NOT NULL,
  tool_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('allowed', 'denied')),
  input_fingerprint text NOT NULL CHECK (
    input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  output_fingerprint text NOT NULL CHECK (
    output_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  error_code text,
  occurred_at timestamptz NOT NULL,
  UNIQUE (account_id, run_id, sequence),
  FOREIGN KEY (account_id, run_id, sequence)
    REFERENCES agent_run_events(account_id, run_id, sequence)
);

CREATE TABLE agent_run_outputs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('validated', 'quarantined')),
  output_fingerprint text NOT NULL CHECK (
    output_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  structured_output jsonb NOT NULL CHECK (
    jsonb_typeof(structured_output) IN (
      'object', 'array', 'string', 'number', 'boolean', 'null'
    )
  ),
  recorded_at timestamptz NOT NULL,
  UNIQUE (account_id, run_id),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id)
);

CREATE TABLE agent_no_actions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  reason text NOT NULL,
  missing_evidence_refs jsonb NOT NULL CHECK (
    jsonb_typeof(missing_evidence_refs) = 'array'
  ),
  candidate_fingerprint text NOT NULL CHECK (
    candidate_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  external_effects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    external_effects = '[]'::jsonb
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, run_id),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id),
  FOREIGN KEY (account_id, pursuit_id) REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);
