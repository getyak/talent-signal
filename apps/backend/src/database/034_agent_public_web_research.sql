ALTER TABLE agent_runs
  DROP CONSTRAINT agent_runs_status_check,
  ADD CONSTRAINT agent_runs_status_check CHECK (
    status IN (
      'starting', 'running', 'proposal_staged', 'artifact_created',
      'no_action', 'quarantined', 'budget_exhausted', 'cancelled', 'failed'
    )
  );

ALTER TABLE agent_no_actions
  DROP CONSTRAINT agent_no_actions_reason_code_check,
  ADD CONSTRAINT agent_no_actions_reason_code_check CHECK (
    reason_code IN (
      'NO_MATERIAL_CHANGE',
      'INSUFFICIENT_EVIDENCE',
      'UNTRUSTED_INSTRUCTION',
      'AMBIGUOUS_TIME',
      'PROHIBITED_PERSON_ASSESSMENT',
      'UNSUPPORTED_INPUT_CAPABILITY',
      'PUBLIC_RESEARCH_UNAVAILABLE'
    )
  );

CREATE TABLE agent_research_artifacts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  run_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 8000),
  limitations text NOT NULL CHECK (char_length(limitations) <= 2000),
  sources jsonb NOT NULL CHECK (
    jsonb_typeof(sources) = 'array'
    AND jsonb_array_length(sources) BETWEEN 1 AND 20
  ),
  candidate_fingerprint text NOT NULL CHECK (
    candidate_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL CHECK (status = 'draft'),
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, run_id),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id),
  FOREIGN KEY (account_id, pursuit_id) REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);

CREATE INDEX agent_research_artifacts_scope_idx
  ON agent_research_artifacts(account_id, pursuit_id, created_at DESC);

CREATE INDEX agent_research_artifacts_retention_idx
  ON agent_research_artifacts(retention_expires_at);
