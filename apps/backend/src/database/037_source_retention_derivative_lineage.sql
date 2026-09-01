CREATE TABLE source_retention_derivative_lineage (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id uuid NOT NULL,
  disposition text NOT NULL CHECK (
    disposition IN (
      'content_purged',
      'access_revoked',
      'audit_reference_retained',
      'confirmed_state_retained'
    )
  ),
  recorded_at timestamptz NOT NULL,
  UNIQUE (account_id, id),
  UNIQUE (account_id, receipt_id, entity_type, entity_id),
  FOREIGN KEY (account_id, receipt_id)
    REFERENCES source_retention_receipts(account_id, receipt_id),
  FOREIGN KEY (account_id, capture_id)
    REFERENCES captures(account_id, id)
);

CREATE INDEX source_retention_derivative_lineage_receipt_idx
  ON source_retention_derivative_lineage(
    account_id, receipt_id, recorded_at, entity_type, entity_id
  );
