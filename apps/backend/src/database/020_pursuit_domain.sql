CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'deleted')
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id)
);

CREATE TABLE pursuits (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  pursuit_type text NOT NULL CHECK (
    pursuit_type IN ('recruiting', 'sales')
  ),
  title text NOT NULL,
  target_outcome text NOT NULL,
  target_date date NOT NULL,
  status text NOT NULL CHECK (
    status IN ('draft', 'active', 'paused', 'succeeded', 'failed', 'cancelled')
  ),
  milestone text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, updated_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX pursuits_account_attention_idx
  ON pursuits(account_id, status, target_date, updated_at DESC);

CREATE TABLE pursuit_roles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  person_id uuid,
  organization_id uuid,
  role_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'quiet', 'removed')),
  confidence text NOT NULL CHECK (confidence IN ('confirmed', 'suggested')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  CHECK (
    ((person_id IS NOT NULL)::integer +
     (organization_id IS NOT NULL)::integer) = 1
  ),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, person_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, organization_id)
    REFERENCES organizations(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE UNIQUE INDEX pursuit_roles_active_subject_role_idx
  ON pursuit_roles(
    account_id,
    pursuit_id,
    COALESCE(person_id, organization_id),
    role_type
  )
  WHERE status <> 'removed';

CREATE TABLE pursuit_role_evidence (
  account_id uuid NOT NULL,
  role_id uuid NOT NULL,
  evidence_fragment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, role_id, evidence_fragment_id),
  FOREIGN KEY (account_id, role_id)
    REFERENCES pursuit_roles(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE TABLE pursuit_criteria (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  criterion_key text NOT NULL,
  label text NOT NULL,
  requirement text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'retired')
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, pursuit_id, criterion_key),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id)
);

CREATE TABLE pursuit_gaps (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'closed', 'dismissed')
  ),
  basis_kind text NOT NULL CHECK (
    basis_kind IN ('user_authored', 'evidence_supported')
  ),
  basis_summary text NOT NULL,
  close_condition text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_user_id uuid NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id),
  CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status <> 'closed' AND closed_at IS NULL)
  )
);

CREATE TABLE pursuit_gap_evidence (
  account_id uuid NOT NULL,
  gap_id uuid NOT NULL,
  evidence_fragment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, gap_id, evidence_fragment_id),
  FOREIGN KEY (account_id, gap_id)
    REFERENCES pursuit_gaps(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

CREATE TABLE pursuit_actions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  gap_id uuid,
  title text NOT NULL,
  owner_user_id uuid NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'drafted',
      'awaiting_confirmation',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'failed'
    )
  ),
  due_at timestamptz,
  external_effects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(external_effects) = 'array'
    AND jsonb_array_length(external_effects) = 0
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, gap_id)
    REFERENCES pursuit_gaps(account_id, id),
  FOREIGN KEY (account_id, owner_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX pursuit_actions_attention_idx
  ON pursuit_actions(account_id, owner_user_id, status, due_at);

CREATE TABLE pursuit_operations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  idempotency_record_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (
    operation_kind IN ('create_pursuit', 'revise_pursuit')
  ),
  status text NOT NULL CHECK (
    status IN ('confirming', 'applied', 'conflict', 'failed', 'unknown_locked')
  ),
  before_revision integer NOT NULL CHECK (before_revision >= 0),
  after_revision integer CHECK (after_revision > 0),
  changed_fields jsonb NOT NULL CHECK (
    jsonb_typeof(changed_fields) = 'array'
  ),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (account_id, id),
  UNIQUE (account_id, idempotency_record_id),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, idempotency_record_id)
    REFERENCES idempotency_records(account_id, id),
  FOREIGN KEY (account_id, requested_by_user_id)
    REFERENCES users(account_id, id),
  CHECK (
    (status = 'applied' AND after_revision IS NOT NULL AND resolved_at IS NOT NULL)
    OR status <> 'applied'
  )
);

CREATE TABLE pursuit_receipts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (
    operation_kind IN ('create_pursuit', 'revise_pursuit')
  ),
  status text NOT NULL CHECK (status = 'applied'),
  before_revision integer NOT NULL CHECK (before_revision >= 0),
  after_revision integer NOT NULL CHECK (after_revision > 0),
  changed_fields jsonb NOT NULL CHECK (
    jsonb_typeof(changed_fields) = 'array'
  ),
  summary text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, operation_id),
  FOREIGN KEY (account_id, operation_id)
    REFERENCES pursuit_operations(account_id, id),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, actor_user_id)
    REFERENCES users(account_id, id)
);
