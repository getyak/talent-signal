ALTER TABLE source_retention_receipts
  DROP CONSTRAINT source_retention_receipts_source_scope_check;

ALTER TABLE source_retention_receipts
  ADD CONSTRAINT source_retention_receipts_source_scope_check
  CHECK (
    source_scope IN (
      'reviewed_selected_text',
      'reviewed_evidence_crop',
      'reviewed_extracted_text',
      'full_reviewed_source',
      'legacy_unknown'
    )
  );
