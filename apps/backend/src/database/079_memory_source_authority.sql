-- GET-40 source-authority correction: pending proposals require the original
-- admitted source to still be available, while accepted minimum evidence from a
-- commit before expiry keeps independent retention. Identity rebind tombstones
-- are epoch-scoped via captures.version.

ALTER TABLE memory_source_revocations
  ADD COLUMN source_version integer;

ALTER TABLE memory_item_evidence
  ADD COLUMN source_capture_version integer;

ALTER TABLE memory_proposal_items
  ADD COLUMN source_capture_version integer;

ALTER TABLE memory_proposals
  ADD COLUMN source_message_text_hash text,
  ADD COLUMN source_image_manifest jsonb,
  ADD COLUMN source_capture_version integer,
  ADD COLUMN source_subject_id uuid,
  ADD COLUMN source_relationship_context_id uuid;
