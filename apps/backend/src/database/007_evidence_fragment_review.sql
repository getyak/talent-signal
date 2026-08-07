CREATE TABLE evidence_fragment_reviews (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  fragment_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  prior_review_status text NOT NULL CHECK (
    prior_review_status IN ('proposed', 'reviewed', 'rejected')
  ),
  decision text NOT NULL CHECK (
    decision IN ('reviewed', 'rejected')
  ),
  reason text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, fragment_id)
    REFERENCES evidence_fragments(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX evidence_fragment_reviews_fragment_idx
  ON evidence_fragment_reviews(account_id, fragment_id, decided_at DESC);
