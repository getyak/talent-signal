ALTER TABLE pursuits
  ADD COLUMN milestone_authority_kind text NOT NULL DEFAULT 'user_authored'
    CHECK (milestone_authority_kind IN ('user_authored', 'evidence_supported')),
  ADD COLUMN milestone_authority_proposal_id uuid,
  ADD COLUMN milestone_authority_proposal_item_id uuid,
  ADD COLUMN milestone_authority_operation_id uuid,
  ADD COLUMN milestone_authority_receipt_id uuid,
  ADD COLUMN milestone_authority_user_id uuid,
  ADD COLUMN milestone_authority_at timestamptz;

WITH latest_milestone_write AS (
  SELECT DISTINCT ON (pursuits.account_id, pursuits.id)
    pursuits.account_id,
    pursuits.id AS pursuit_id,
    operations.id AS operation_id,
    operations.proposal_id,
    operations.requested_by_user_id,
    operations.resolved_at,
    receipts.id AS receipt_id,
    proposal_item.id AS proposal_item_id
  FROM pursuits
  JOIN pursuit_operations operations
    ON operations.account_id = pursuits.account_id
   AND operations.pursuit_id = pursuits.id
   AND operations.status = 'applied'
   AND operations.changed_fields ? 'milestone'
  LEFT JOIN pursuit_receipts receipts
    ON receipts.account_id = operations.account_id
   AND receipts.operation_id = operations.id
  LEFT JOIN LATERAL (
    SELECT items.id
    FROM pursuit_proposal_items items
    WHERE items.account_id = operations.account_id
      AND items.proposal_id = operations.proposal_id
      AND items.change_kind = 'set_milestone'
      AND items.decision_status IN ('confirmed', 'edited')
    ORDER BY items.decided_at DESC, items.id
    LIMIT 1
  ) proposal_item ON true
  ORDER BY
    pursuits.account_id,
    pursuits.id,
    operations.resolved_at DESC NULLS LAST,
    operations.id DESC
)
UPDATE pursuits
SET milestone_authority_kind = CASE
      WHEN latest.proposal_id IS NULL THEN 'user_authored'
      ELSE 'evidence_supported'
    END,
    milestone_authority_proposal_id = latest.proposal_id,
    milestone_authority_proposal_item_id = latest.proposal_item_id,
    milestone_authority_operation_id = latest.operation_id,
    milestone_authority_receipt_id = latest.receipt_id,
    milestone_authority_user_id = latest.requested_by_user_id,
    milestone_authority_at = latest.resolved_at
FROM latest_milestone_write latest
WHERE pursuits.account_id = latest.account_id
  AND pursuits.id = latest.pursuit_id;

UPDATE pursuits
SET milestone_authority_user_id = updated_by_user_id,
    milestone_authority_at = updated_at
WHERE milestone_authority_user_id IS NULL
   OR milestone_authority_at IS NULL;

ALTER TABLE pursuits
  ALTER COLUMN milestone_authority_user_id SET NOT NULL,
  ALTER COLUMN milestone_authority_at SET NOT NULL,
  ADD CONSTRAINT pursuits_milestone_authority_proposal_fk
    FOREIGN KEY (account_id, milestone_authority_proposal_id)
      REFERENCES pursuit_proposals(account_id, id),
  ADD CONSTRAINT pursuits_milestone_authority_proposal_item_fk
    FOREIGN KEY (account_id, milestone_authority_proposal_item_id)
      REFERENCES pursuit_proposal_items(account_id, id),
  ADD CONSTRAINT pursuits_milestone_authority_operation_fk
    FOREIGN KEY (account_id, milestone_authority_operation_id)
      REFERENCES pursuit_operations(account_id, id),
  ADD CONSTRAINT pursuits_milestone_authority_receipt_fk
    FOREIGN KEY (account_id, milestone_authority_receipt_id)
      REFERENCES pursuit_receipts(account_id, id),
  ADD CONSTRAINT pursuits_milestone_authority_user_fk
    FOREIGN KEY (account_id, milestone_authority_user_id)
      REFERENCES users(account_id, id),
  ADD CONSTRAINT pursuits_milestone_authority_shape_check CHECK (
    (
      milestone_authority_kind = 'evidence_supported'
      AND milestone_authority_proposal_id IS NOT NULL
      AND milestone_authority_proposal_item_id IS NOT NULL
      AND milestone_authority_operation_id IS NOT NULL
      AND milestone_authority_receipt_id IS NOT NULL
    )
    OR
    (
      milestone_authority_kind = 'user_authored'
      AND milestone_authority_proposal_id IS NULL
      AND milestone_authority_proposal_item_id IS NULL
    )
  );
