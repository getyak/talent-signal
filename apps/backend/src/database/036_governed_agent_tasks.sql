CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = 'pre_call_briefing'),
  objective text NOT NULL CHECK (length(btrim(objective)) > 0),
  objective_digest text NOT NULL CHECK (objective_digest ~ '^[0-9a-f]{64}$'),
  scope_digest text NOT NULL CHECK (scope_digest ~ '^[0-9a-f]{64}$'),
  task_revision integer NOT NULL DEFAULT 1 CHECK (task_revision > 0),
  status text NOT NULL CHECK (
    status IN (
      'active', 'waiting_for_clarification', 'waiting_for_domain_decision',
      'waiting_for_external', 'needs_rebase', 'completed', 'no_action',
      'abstained', 'failed', 'cancelled', 'expired'
    )
  ),
  permission_ceiling jsonb NOT NULL CHECK (
    jsonb_typeof(permission_ceiling) = 'array'
    AND permission_ceiling <@ '[
      "read_pursuit", "read_evidence", "create_briefing_artifact",
      "stage_pursuit_proposal", "record_no_action"
    ]'::jsonb
  ),
  semantic_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(semantic_snapshot) = 'object'
    AND semantic_snapshot ?& ARRAY[
      'pursuit_revision', 'evidence_manifest_digest',
      'agent_definition_digest', 'tool_schema_digest', 'policy_digest',
      'model_digest', 'created_at'
    ]
  ),
  evidence_refs jsonb NOT NULL CHECK (jsonb_typeof(evidence_refs) = 'array'),
  input_artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(input_artifact_refs) = 'array'
  ),
  telemetry jsonb,
  active_attempt integer CHECK (active_attempt IS NULL OR active_attempt > 0),
  lease_owner text,
  lease_epoch integer NOT NULL DEFAULT 0 CHECK (lease_epoch >= 0),
  lease_expires_at timestamptz,
  continue_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, pursuit_id) REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, requested_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  CHECK (
    (
      status IN (
        'active', 'waiting_for_clarification', 'waiting_for_domain_decision',
        'waiting_for_external', 'needs_rebase'
      )
      AND completed_at IS NULL
    )
    OR
    (
      status IN (
        'completed', 'no_action', 'abstained', 'failed', 'cancelled', 'expired'
      )
      AND completed_at IS NOT NULL
    )
  ),
  CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX agent_tasks_one_active_objective_idx
  ON agent_tasks(account_id, pursuit_id, kind, objective_digest, scope_digest)
  WHERE status IN (
    'active', 'waiting_for_clarification', 'waiting_for_domain_decision',
    'waiting_for_external', 'needs_rebase'
  );

CREATE INDEX agent_tasks_pursuit_attention_idx
  ON agent_tasks(account_id, pursuit_id, status, updated_at DESC, id);

CREATE TABLE agent_task_runs (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  expected_task_revision integer NOT NULL CHECK (expected_task_revision > 0),
  status text NOT NULL CHECK (
    status IN (
      'scheduled', 'running', 'suspended', 'completed', 'failed',
      'superseded', 'cancelled'
    )
  ),
  agent_run_id uuid,
  run_idempotency_key text NOT NULL CHECK (length(run_idempotency_key) > 0),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  lease_epoch integer NOT NULL CHECK (lease_epoch > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, task_id, attempt),
  UNIQUE (account_id, agent_run_id),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  FOREIGN KEY (account_id, agent_run_id) REFERENCES agent_runs(account_id, id),
  CHECK (
    (status IN ('scheduled', 'running', 'suspended') AND completed_at IS NULL)
    OR
    (status IN ('completed', 'failed', 'superseded', 'cancelled')
      AND completed_at IS NOT NULL)
  )
);

CREATE TABLE agent_task_checkpoints (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_run_id uuid NOT NULL,
  checkpoint_sequence integer NOT NULL CHECK (checkpoint_sequence > 0),
  phase text NOT NULL CHECK (
    phase IN (
      'task_accepted', 'context_frozen', 'provider_running',
      'provider_terminal', 'projection_committed', 'suspended'
    )
  ),
  public_state jsonb NOT NULL CHECK (jsonb_typeof(public_state) = 'object'),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, task_run_id, checkpoint_sequence),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  FOREIGN KEY (account_id, task_run_id)
    REFERENCES agent_task_runs(account_id, id)
);

CREATE TABLE agent_artifacts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_run_id uuid NOT NULL,
  agent_run_id uuid,
  type text NOT NULL CHECK (type = 'pursuit_briefing'),
  authority text NOT NULL CHECK (authority = 'non_canonical'),
  status text NOT NULL CHECK (
    status IN ('current', 'stale', 'superseded', 'redacted')
  ),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  evidence_manifest_digest text NOT NULL CHECK (
    evidence_manifest_digest ~ '^[0-9a-f]{64}$'
  ),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, task_id, task_run_id),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  FOREIGN KEY (account_id, task_run_id)
    REFERENCES agent_task_runs(account_id, id),
  FOREIGN KEY (account_id, agent_run_id) REFERENCES agent_runs(account_id, id),
  CHECK (expires_at > observed_at)
);

CREATE TABLE agent_artifact_evidence (
  account_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  fragment_id uuid NOT NULL,
  manifest_order integer NOT NULL CHECK (manifest_order >= 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (account_id, artifact_id, fragment_id),
  UNIQUE (account_id, artifact_id, manifest_order),
  FOREIGN KEY (account_id, artifact_id) REFERENCES agent_artifacts(account_id, id),
  FOREIGN KEY (account_id, fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE INDEX agent_artifact_evidence_fragment_idx
  ON agent_artifact_evidence(account_id, fragment_id, artifact_id);

CREATE TABLE agent_clarification_requests (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_revision integer NOT NULL CHECK (task_revision > 0),
  request_revision integer NOT NULL DEFAULT 1 CHECK (request_revision > 0),
  question text NOT NULL CHECK (length(btrim(question)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  response_schema jsonb NOT NULL CHECK (jsonb_typeof(response_schema) = 'object'),
  status text NOT NULL CHECK (
    status IN ('open', 'answered', 'expired', 'cancelled')
  ),
  answer_digest text CHECK (answer_digest IS NULL OR answer_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  CHECK (
    (status = 'answered' AND answer_digest IS NOT NULL AND answered_at IS NOT NULL)
    OR (status <> 'answered' AND answered_at IS NULL)
  )
);

CREATE UNIQUE INDEX agent_clarifications_one_open_idx
  ON agent_clarification_requests(account_id, task_id)
  WHERE status = 'open';

CREATE TABLE agent_decision_bundles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_revision integer NOT NULL CHECK (task_revision > 0),
  bundle_revision integer NOT NULL DEFAULT 1 CHECK (bundle_revision > 0),
  dependency text NOT NULL CHECK (length(btrim(dependency)) > 0),
  status text NOT NULL CHECK (
    status IN ('open', 'partially_resolved', 'resolved', 'expired', 'cancelled')
  ),
  proposal_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES pursuit_proposals(account_id, id)
);

CREATE UNIQUE INDEX agent_decision_bundles_one_open_idx
  ON agent_decision_bundles(account_id, task_id)
  WHERE status IN ('open', 'partially_resolved');

CREATE TABLE agent_decision_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  bundle_id uuid NOT NULL,
  domain_subject_kind text NOT NULL CHECK (
    domain_subject_kind IN (
      'pursuit_proposal_item', 'fact_decision', 'action_approval'
    )
  ),
  domain_subject_id uuid NOT NULL,
  item_revision integer NOT NULL DEFAULT 1 CHECK (item_revision > 0),
  status text NOT NULL CHECK (
    status IN (
      'open', 'accepted', 'edited', 'rejected', 'kept_unresolved', 'expired'
    )
  ),
  domain_receipt_ref uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, bundle_id, domain_subject_kind, domain_subject_id),
  FOREIGN KEY (account_id, bundle_id)
    REFERENCES agent_decision_bundles(account_id, id)
);

CREATE TABLE agent_task_events (
  event_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  run_id uuid,
  task_sequence integer NOT NULL CHECK (task_sequence > 0),
  name text NOT NULL CHECK (
    name IN (
      'task.accepted', 'run.started', 'context.compiled',
      'checkpoint.saved', 'artifact.ready', 'clarification.requested',
      'decision.requested', 'decision.resolved', 'task.needs_rebase',
      'task.cancelled', 'run.completed', 'run.no_action',
      'run.abstained', 'run.failed'
    )
  ),
  public_payload jsonb NOT NULL CHECK (jsonb_typeof(public_payload) = 'object'),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, event_id),
  UNIQUE (account_id, task_id, task_sequence),
  FOREIGN KEY (account_id, task_id) REFERENCES agent_tasks(account_id, id),
  FOREIGN KEY (account_id, run_id) REFERENCES agent_runs(account_id, id)
);

CREATE TABLE agent_delivery_outbox (
  stream_cursor bigserial PRIMARY KEY,
  account_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_sequence integer NOT NULL,
  event_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, event_id),
  FOREIGN KEY (account_id, task_id, task_sequence)
    REFERENCES agent_task_events(account_id, task_id, task_sequence),
  FOREIGN KEY (account_id, event_id)
    REFERENCES agent_task_events(account_id, event_id)
);

CREATE INDEX agent_delivery_outbox_unpublished_idx
  ON agent_delivery_outbox(stream_cursor)
  WHERE published_at IS NULL;
