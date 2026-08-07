ALTER TABLE evidence_fragments
  ADD COLUMN review_status text NOT NULL DEFAULT 'reviewed' CHECK (
    review_status IN ('proposed', 'reviewed', 'rejected')
  );

ALTER TABLE evidence_fragments
  DROP CONSTRAINT evidence_fragments_fragment_kind_check;

ALTER TABLE evidence_fragments
  ADD CONSTRAINT evidence_fragments_fragment_kind_check CHECK (
    fragment_kind IN (
      'message',
      'page_text',
      'document_text',
      'document_region',
      'url_excerpt',
      'note_revision',
      'contact_field'
    )
  );

ALTER TABLE source_resources
  ADD COLUMN duplicate_of_resource_id uuid;

ALTER TABLE source_resources
  ADD CONSTRAINT source_resources_duplicate_of_resource_fk
  FOREIGN KEY (account_id, duplicate_of_resource_id)
  REFERENCES source_resources(account_id, id);

CREATE INDEX source_resources_duplicate_of_idx
  ON source_resources(account_id, duplicate_of_resource_id)
  WHERE duplicate_of_resource_id IS NOT NULL
    AND processing_state <> 'deleted';

ALTER TABLE source_retention_receipts
  ADD COLUMN review_completion_event text CHECK (
    review_completion_event IN (
      'analysis_proposal_committed',
      'resource_intake_committed'
    )
  );

UPDATE source_retention_receipts
SET review_completion_event = 'analysis_proposal_committed'
WHERE effective_mode <> 'legacy_unknown';

ALTER TABLE source_retention_events
  DROP CONSTRAINT source_retention_events_reason_check;

ALTER TABLE source_retention_events
  ADD CONSTRAINT source_retention_events_reason_check CHECK (
    reason IN (
      'capture_submitted',
      'analysis_proposal_committed',
      'resource_intake_committed',
      'review_completed',
      'retention_deadline_elapsed',
      'manual_deletion',
      'legacy_unverified'
    )
  );
