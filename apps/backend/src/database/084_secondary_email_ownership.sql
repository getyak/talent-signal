-- Verified secondary email reservations (ADR 0018, "Verified secondary
-- emails"). A linked provider that verifies an address different from the
-- primary email reserves that exact normalized address for the existing
-- canonical account under the same email lock and uniqueness arbitration as
-- registration. Reservations carry explicit verification provenance; missing
-- or unverified hints are never claims and historical hints are never
-- backfilled as verified.

ALTER TABLE account_email_reservations
  ADD COLUMN claim_kind text NOT NULL DEFAULT 'primary'
    CHECK (claim_kind IN ('primary', 'secondary')),
  ADD COLUMN verification_source text,
  ADD COLUMN verified_at timestamptz;

-- Provenance is explicit: a source and its verification time stand or fall
-- together. Historical rows keep NULL provenance and are not upgraded.
ALTER TABLE account_email_reservations
  ADD CONSTRAINT account_email_reservations_provenance_check
  CHECK ((verification_source IS NULL) = (verified_at IS NULL));

-- Secondary claims never carry the canonical primary-email role by accident:
-- a provider-verified alias is always a secondary claim.
ALTER TABLE account_email_reservations
  ADD CONSTRAINT account_email_reservations_secondary_provenance_check
  CHECK (claim_kind = 'primary' OR verification_source IS NOT NULL);
