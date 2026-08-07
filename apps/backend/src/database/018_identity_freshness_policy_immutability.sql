CREATE FUNCTION enforce_identity_freshness_policy_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Published identity freshness policies cannot be deleted; retire and supersede them.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.version IS DISTINCT FROM OLD.version
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.policy_document IS DISTINCT FROM OLD.policy_document
      OR NEW.max_override_days IS DISTINCT FROM OLD.max_override_days
      OR OLD.effective_until IS NOT NULL
      OR NEW.effective_until IS NULL
    THEN
      RAISE EXCEPTION
        'Published identity freshness policy content is immutable; only one-way retirement is allowed.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM identity_handle_freshness_policies policies
    WHERE policies.version <> NEW.version
      AND tstzrange(
        policies.effective_from,
        policies.effective_until,
        '[)'
      ) && tstzrange(
        NEW.effective_from,
        NEW.effective_until,
        '[)'
      )
  ) THEN
    RAISE EXCEPTION
      'Identity freshness policy effective intervals cannot overlap.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER identity_freshness_policy_immutable
  BEFORE INSERT OR UPDATE OR DELETE
  ON identity_handle_freshness_policies
  FOR EACH ROW
  EXECUTE FUNCTION enforce_identity_freshness_policy_immutability();
