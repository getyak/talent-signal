ALTER TABLE proposed_assertions
  ADD COLUMN evidence_fragment_id uuid;

ALTER TABLE proposed_assertions
  ADD CONSTRAINT proposed_assertions_evidence_fragment_fk
  FOREIGN KEY (account_id, evidence_fragment_id)
  REFERENCES evidence_fragments(account_id, id);

CREATE INDEX proposed_assertions_evidence_fragment_idx
  ON proposed_assertions(account_id, evidence_fragment_id)
  WHERE evidence_fragment_id IS NOT NULL;

CREATE UNIQUE INDEX proposed_assertions_one_resource_claim_idx
  ON proposed_assertions(
    account_id,
    evidence_fragment_id,
    field,
    evidence_quote
  )
  WHERE evidence_fragment_id IS NOT NULL
    AND review_status <> 'deleted';
