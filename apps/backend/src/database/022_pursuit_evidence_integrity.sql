ALTER TABLE pursuit_roles
  ADD COLUMN basis_kind text;

UPDATE pursuit_roles roles
SET basis_kind = CASE
  WHEN EXISTS (
    SELECT 1
    FROM pursuit_role_evidence evidence
    WHERE evidence.account_id = roles.account_id
      AND evidence.role_id = roles.id
  ) THEN 'evidence_supported'
  ELSE 'user_authored'
END;

ALTER TABLE pursuit_roles
  ALTER COLUMN basis_kind SET NOT NULL,
  ADD CONSTRAINT pursuit_roles_basis_kind_check CHECK (
    basis_kind IN ('evidence_supported', 'user_authored')
  );

CREATE INDEX pursuit_role_evidence_fragment_idx
  ON pursuit_role_evidence(account_id, evidence_fragment_id, role_id);

CREATE INDEX pursuit_gap_evidence_fragment_idx
  ON pursuit_gap_evidence(account_id, evidence_fragment_id, gap_id);

CREATE INDEX pursuit_proposal_evidence_fragment_idx
  ON pursuit_proposal_item_evidence(
    account_id,
    evidence_fragment_id,
    proposal_item_id
  );

ALTER TABLE pursuit_roles ADD COLUMN display_order integer;
ALTER TABLE pursuit_criteria ADD COLUMN display_order integer;
ALTER TABLE pursuit_gaps ADD COLUMN display_order integer;
ALTER TABLE pursuit_actions ADD COLUMN display_order integer;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY account_id, pursuit_id ORDER BY created_at, id
  ) - 1 AS display_order
  FROM pursuit_roles
)
UPDATE pursuit_roles target
SET display_order = ranked.display_order
FROM ranked
WHERE target.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY account_id, pursuit_id ORDER BY created_at, id
  ) - 1 AS display_order
  FROM pursuit_criteria
)
UPDATE pursuit_criteria target
SET display_order = ranked.display_order
FROM ranked
WHERE target.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY account_id, pursuit_id ORDER BY created_at, id
  ) - 1 AS display_order
  FROM pursuit_gaps
)
UPDATE pursuit_gaps target
SET display_order = ranked.display_order
FROM ranked
WHERE target.id = ranked.id;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY account_id, pursuit_id ORDER BY created_at, id
  ) - 1 AS display_order
  FROM pursuit_actions
)
UPDATE pursuit_actions target
SET display_order = ranked.display_order
FROM ranked
WHERE target.id = ranked.id;

ALTER TABLE pursuit_roles
  ALTER COLUMN display_order SET NOT NULL,
  ADD CONSTRAINT pursuit_roles_display_order_check CHECK (display_order >= 0);
ALTER TABLE pursuit_criteria
  ALTER COLUMN display_order SET NOT NULL,
  ADD CONSTRAINT pursuit_criteria_display_order_check CHECK (display_order >= 0);
ALTER TABLE pursuit_gaps
  ALTER COLUMN display_order SET NOT NULL,
  ADD CONSTRAINT pursuit_gaps_display_order_check CHECK (display_order >= 0);
ALTER TABLE pursuit_actions
  ALTER COLUMN display_order SET NOT NULL,
  ADD CONSTRAINT pursuit_actions_display_order_check CHECK (display_order >= 0);

CREATE UNIQUE INDEX pursuit_roles_display_order_idx
  ON pursuit_roles(account_id, pursuit_id, display_order);
CREATE UNIQUE INDEX pursuit_criteria_display_order_idx
  ON pursuit_criteria(account_id, pursuit_id, display_order);
CREATE UNIQUE INDEX pursuit_gaps_display_order_idx
  ON pursuit_gaps(account_id, pursuit_id, display_order);
CREATE UNIQUE INDEX pursuit_actions_display_order_idx
  ON pursuit_actions(account_id, pursuit_id, display_order);
