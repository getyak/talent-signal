-- Account access audit details are additive and nullable on purpose.
-- Existing 058 rows predate structured details; their history is unknown and
-- must stay unknown rather than be backfilled with invented values.
ALTER TABLE account_access_events ADD COLUMN details jsonb CHECK (details IS NULL OR jsonb_typeof(details) = 'object');
