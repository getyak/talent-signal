CREATE TABLE pursuit_proposals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  pursuit_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  base_revision integer NOT NULL CHECK (base_revision > 0),
  summary text NOT NULL,
  producer_kind text NOT NULL CHECK (producer_kind IN ('agent', 'human')),
  producer_name text NOT NULL,
  producer_version text NOT NULL,
  producer_run_id text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'needs_review',
      'confirming',
      'applied',
      'rejected',
      'kept_unresolved',
      'conflict',
      'failed',
      'superseded'
    )
  ),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, pursuit_id)
    REFERENCES pursuits(account_id, id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id),
  FOREIGN KEY (account_id, created_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX pursuit_proposals_review_queue_idx
  ON pursuit_proposals(account_id, status, created_at, id);

CREATE TABLE pursuit_proposal_items (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  proposal_id uuid NOT NULL,
  item_key text NOT NULL,
  change_kind text NOT NULL CHECK (
    change_kind IN (
      'set_milestone',
      'set_pursuit_status',
      'set_role_status',
      'add_gap',
      'add_action'
    )
  ),
  target_entity_type text NOT NULL CHECK (
    target_entity_type IN ('pursuit', 'pursuit_role', 'pursuit_gap', 'pursuit_action')
  ),
  target_entity_id uuid,
  target_field text NOT NULL,
  before_value jsonb,
  proposed_value jsonb NOT NULL,
  basis_kind text NOT NULL CHECK (
    basis_kind IN ('evidence_supported', 'user_authored')
  ),
  epistemic_status text NOT NULL CHECK (
    epistemic_status IN ('fact', 'inference', 'unknown', 'disputed', 'superseded')
  ),
  reason text NOT NULL,
  effect_summary text NOT NULL,
  decision_status text NOT NULL DEFAULT 'pending' CHECK (
    decision_status IN (
      'pending', 'confirmed', 'edited', 'rejected', 'kept_unresolved'
    )
  ),
  decided_value jsonb,
  decided_by_user_id uuid,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  UNIQUE (account_id, proposal_id, item_key),
  FOREIGN KEY (account_id, proposal_id)
    REFERENCES pursuit_proposals(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id),
  CHECK (
    (decision_status = 'pending'
      AND decided_by_user_id IS NULL
      AND decision_reason IS NULL
      AND decided_at IS NULL)
    OR
    (decision_status <> 'pending'
      AND decided_by_user_id IS NOT NULL
      AND decision_reason IS NOT NULL
      AND decided_at IS NOT NULL)
  ),
  CHECK (
    (decision_status IN ('confirmed', 'edited') AND decided_value IS NOT NULL)
    OR
    (decision_status IN ('pending', 'rejected', 'kept_unresolved')
      AND decided_value IS NULL)
  )
);

CREATE TABLE pursuit_proposal_item_evidence (
  account_id uuid NOT NULL,
  proposal_item_id uuid NOT NULL,
  evidence_fragment_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, proposal_item_id, evidence_fragment_id),
  FOREIGN KEY (account_id, proposal_item_id)
    REFERENCES pursuit_proposal_items(account_id, id),
  FOREIGN KEY (account_id, evidence_fragment_id)
    REFERENCES evidence_fragments(account_id, id)
);

ALTER TABLE pursuit_operations
  DROP CONSTRAINT pursuit_operations_operation_kind_check,
  ADD COLUMN proposal_id uuid,
  ADD CONSTRAINT pursuit_operations_operation_kind_check CHECK (
    operation_kind IN (
      'create_pursuit', 'revise_pursuit', 'review_pursuit_proposal'
    )
  ),
  ADD CONSTRAINT pursuit_operations_proposal_fk
    FOREIGN KEY (account_id, proposal_id)
      REFERENCES pursuit_proposals(account_id, id),
  ADD CONSTRAINT pursuit_operations_proposal_kind_check CHECK (
    (operation_kind = 'review_pursuit_proposal' AND proposal_id IS NOT NULL)
    OR
    (operation_kind <> 'review_pursuit_proposal' AND proposal_id IS NULL)
  );

ALTER TABLE pursuit_receipts
  DROP CONSTRAINT pursuit_receipts_operation_kind_check,
  ADD COLUMN proposal_id uuid,
  ADD COLUMN outcome text NOT NULL DEFAULT 'canonical_applied' CHECK (
    outcome IN (
      'canonical_applied', 'mixed_applied', 'rejected', 'kept_unresolved'
    )
  ),
  ADD COLUMN item_decisions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(item_decisions) = 'array'
  ),
  ADD COLUMN external_effects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(external_effects) = 'array'
    AND jsonb_array_length(external_effects) = 0
  ),
  ADD CONSTRAINT pursuit_receipts_operation_kind_check CHECK (
    operation_kind IN (
      'create_pursuit', 'revise_pursuit', 'review_pursuit_proposal'
    )
  ),
  ADD CONSTRAINT pursuit_receipts_proposal_fk
    FOREIGN KEY (account_id, proposal_id)
      REFERENCES pursuit_proposals(account_id, id),
  ADD CONSTRAINT pursuit_receipts_proposal_kind_check CHECK (
    (operation_kind = 'review_pursuit_proposal' AND proposal_id IS NOT NULL)
    OR
    (operation_kind <> 'review_pursuit_proposal' AND proposal_id IS NULL)
  );
