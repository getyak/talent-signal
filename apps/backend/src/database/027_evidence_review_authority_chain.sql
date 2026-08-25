ALTER TABLE evidence_fragment_reviews
  ADD COLUMN prior_review_id uuid,
  ADD COLUMN review_revision integer;

WITH ranked AS (
  SELECT
    account_id,
    fragment_id,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY account_id, fragment_id
      ORDER BY decided_at, id
    )::integer AS review_revision,
    LAG(id) OVER (
      PARTITION BY account_id, fragment_id
      ORDER BY decided_at, id
    ) AS prior_review_id
  FROM evidence_fragment_reviews
)
UPDATE evidence_fragment_reviews reviews
SET
  review_revision = ranked.review_revision,
  prior_review_id = ranked.prior_review_id
FROM ranked
WHERE reviews.account_id = ranked.account_id
  AND reviews.fragment_id = ranked.fragment_id
  AND reviews.id = ranked.id;

ALTER TABLE evidence_fragment_reviews
  ALTER COLUMN review_revision SET NOT NULL,
  ADD CONSTRAINT evidence_fragment_reviews_revision_positive
    CHECK (review_revision > 0),
  ADD CONSTRAINT evidence_fragment_reviews_fragment_revision_unique
    UNIQUE (account_id, fragment_id, review_revision),
  ADD CONSTRAINT evidence_fragment_reviews_fragment_id_unique
    UNIQUE (account_id, fragment_id, id),
  ADD CONSTRAINT evidence_fragment_reviews_prior_review_fk
    FOREIGN KEY (account_id, fragment_id, prior_review_id)
    REFERENCES evidence_fragment_reviews(account_id, fragment_id, id);

CREATE INDEX evidence_fragment_reviews_authority_idx
  ON evidence_fragment_reviews(account_id, fragment_id, review_revision DESC);
