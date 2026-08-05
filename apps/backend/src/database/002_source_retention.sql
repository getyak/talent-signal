ALTER TABLE evidence_items
  DROP CONSTRAINT evidence_items_status_check;

ALTER TABLE evidence_items
  ADD CONSTRAINT evidence_items_status_check
  CHECK (status IN ('active', 'purged', 'deleted'));

ALTER TABLE evidence_items
  ADD COLUMN purged_at timestamptz;

CREATE TABLE source_retention_receipts (
  receipt_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (policy_version = 'source-retention.v1'),
  requested_mode text NOT NULL CHECK (
    requested_mode IN ('ephemeral', 'evidence_crop', 'full_source')
  ),
  effective_mode text NOT NULL CHECK (
    effective_mode IN ('ephemeral', 'evidence_crop', 'full_source')
  ),
  source_scope text NOT NULL CHECK (
    source_scope IN (
      'reviewed_selected_text',
      'reviewed_evidence_crop',
      'full_reviewed_source'
    )
  ),
  source_locator text,
  requested_retention_until timestamptz,
  retention_until timestamptz,
  source_access_state text NOT NULL CHECK (
    source_access_state IN ('available', 'purged', 'deleted')
  ),
  source_access_reason text NOT NULL CHECK (
    source_access_reason IN (
      'awaiting_review_completion',
      'retained_until_deadline',
      'review_completed',
      'retention_deadline_elapsed',
      'manual_deletion'
    )
  ),
  review_completed_at timestamptz,
  source_purged_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, receipt_id),
  UNIQUE (account_id, capture_id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);

CREATE INDEX source_retention_due_idx
  ON source_retention_receipts(retention_until)
  WHERE source_access_state = 'available' AND retention_until IS NOT NULL;

CREATE INDEX source_retention_locator_idx
  ON source_retention_receipts(account_id, source_locator, created_at DESC)
  WHERE source_locator IS NOT NULL;

CREATE TABLE source_retention_events (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'source_submitted',
      'review_completed',
      'source_purged',
      'source_deleted'
    )
  ),
  reason text NOT NULL CHECK (
    reason IN (
      'capture_submitted',
      'analysis_proposal_committed',
      'review_completed',
      'retention_deadline_elapsed',
      'manual_deletion'
    )
  ),
  occurred_at timestamptz NOT NULL,
  UNIQUE (account_id, receipt_id, event_type),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES source_retention_receipts(account_id, receipt_id),
  FOREIGN KEY (account_id, capture_id) REFERENCES captures(account_id, id)
);

INSERT INTO source_retention_receipts(
  receipt_id,
  account_id,
  capture_id,
  policy_version,
  requested_mode,
  effective_mode,
  source_scope,
  source_locator,
  requested_retention_until,
  retention_until,
  source_access_state,
  source_access_reason,
  source_purged_at,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  captures.id,
  captures.account_id,
  captures.id,
  'source-retention.v1',
  'full_source',
  'full_source',
  'full_reviewed_source',
  captures.source_metadata->>'source_locator',
  captures.retention_until,
  COALESCE(captures.retention_until, captures.created_at + interval '7 days'),
  CASE WHEN captures.status = 'deleted' THEN 'deleted' ELSE 'available' END,
  CASE
    WHEN captures.status = 'deleted' THEN 'manual_deletion'
    ELSE 'retained_until_deadline'
  END,
  captures.deleted_at,
  captures.deleted_at,
  captures.created_at,
  captures.updated_at
FROM captures;

UPDATE captures
SET retention_until = receipts.retention_until
FROM source_retention_receipts receipts
WHERE receipts.account_id = captures.account_id
  AND receipts.capture_id = captures.id;

INSERT INTO source_retention_events(
  id,
  account_id,
  receipt_id,
  capture_id,
  event_type,
  reason,
  occurred_at
)
SELECT
  gen_random_uuid(),
  account_id,
  receipt_id,
  capture_id,
  'source_submitted',
  'capture_submitted',
  created_at
FROM source_retention_receipts;

INSERT INTO source_retention_events(
  id,
  account_id,
  receipt_id,
  capture_id,
  event_type,
  reason,
  occurred_at
)
SELECT
  gen_random_uuid(),
  account_id,
  receipt_id,
  capture_id,
  'source_deleted',
  'manual_deletion',
  deleted_at
FROM source_retention_receipts
WHERE deleted_at IS NOT NULL;
