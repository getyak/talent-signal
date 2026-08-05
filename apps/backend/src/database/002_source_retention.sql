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
  policy_version text NOT NULL CHECK (policy_version = 'source-retention.v2'),
  requested_mode text NOT NULL CHECK (
    requested_mode IN (
      'ephemeral',
      'evidence_crop',
      'full_source',
      'legacy_unknown'
    )
  ),
  effective_mode text NOT NULL CHECK (
    effective_mode IN (
      'ephemeral',
      'evidence_crop',
      'full_source',
      'legacy_unknown'
    )
  ),
  source_scope text NOT NULL CHECK (
    source_scope IN (
      'reviewed_selected_text',
      'reviewed_evidence_crop',
      'full_reviewed_source',
      'legacy_unknown'
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
      'manual_deletion',
      'legacy_unverified'
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
      'manual_deletion',
      'legacy_unverified'
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
  'source-retention.v2',
  'legacy_unknown',
  'legacy_unknown',
  'legacy_unknown',
  captures.source_metadata->>'source_locator',
  NULL,
  NULL,
  CASE
    WHEN captures.status = 'deleted' THEN 'deleted'
    ELSE 'purged'
  END,
  CASE
    WHEN captures.status = 'deleted' THEN 'manual_deletion'
    ELSE 'legacy_unverified'
  END,
  CASE
    WHEN captures.status = 'deleted' THEN captures.deleted_at
    ELSE now()
  END,
  captures.deleted_at,
  captures.created_at,
  captures.updated_at
FROM captures;

UPDATE captures
SET retention_until = NULL
FROM source_retention_receipts receipts
WHERE receipts.account_id = captures.account_id
  AND receipts.capture_id = captures.id;

UPDATE evidence_items
SET status = 'purged',
    redacted_text = NULL,
    content_hash = 'legacy-unverified',
    purged_at = receipts.source_purged_at
FROM source_retention_receipts receipts
WHERE receipts.account_id = evidence_items.account_id
  AND receipts.capture_id = evidence_items.capture_id
  AND receipts.effective_mode = 'legacy_unknown'
  AND evidence_items.status = 'active';

UPDATE proposed_assertions
SET evidence_quote = NULL
FROM source_retention_receipts receipts
WHERE receipts.account_id = proposed_assertions.account_id
  AND receipts.capture_id = proposed_assertions.capture_id
  AND receipts.effective_mode = 'legacy_unknown';

UPDATE captures
SET source_metadata = jsonb_strip_nulls(jsonb_build_object(
      'kind', source_kind,
      'captured_at', source_metadata->'captured_at',
      'source_timezone', source_metadata->'source_timezone',
      'purpose',
      'Legacy source unavailable because its original scope was unverified.'
    )),
    purpose =
      'Legacy source unavailable because its original scope was unverified.',
    version = version + 1,
    updated_at = receipts.source_purged_at
FROM source_retention_receipts receipts
WHERE receipts.account_id = captures.account_id
  AND receipts.capture_id = captures.id
  AND receipts.effective_mode = 'legacy_unknown'
  AND captures.status = 'active';

UPDATE idempotency_records
SET response_body = jsonb_build_object(
      'capture_id',
      receipts.capture_id
    )
FROM source_retention_receipts receipts
WHERE receipts.account_id = idempotency_records.account_id
  AND receipts.effective_mode = 'legacy_unknown'
  AND idempotency_records.operation_scope = 'create_capture'
  AND idempotency_records.response_body->>'id' =
    receipts.capture_id::text;

UPDATE idempotency_records
SET response_body = jsonb_set(
      response_body,
      '{assertions}',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_set(assertion, '{evidence_quote}', 'null'::jsonb, true)
          )
          FROM jsonb_array_elements(response_body->'assertions') assertion
        ),
        '[]'::jsonb
      ),
      true
    )
FROM source_retention_receipts receipts
WHERE receipts.account_id = idempotency_records.account_id
  AND receipts.effective_mode = 'legacy_unknown'
  AND idempotency_records.operation_scope =
    'submit_analysis:' || receipts.capture_id::text
  AND idempotency_records.response_body ? 'assertions';

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
  'source_purged',
  'legacy_unverified',
  source_purged_at
FROM source_retention_receipts
WHERE source_access_state = 'purged'
  AND source_access_reason = 'legacy_unverified'
  AND source_purged_at IS NOT NULL;

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
