-- Identity claims cached in SDK working context must follow the same lifecycle.
CREATE TRIGGER invalidate_harness_identity_handle AFTER UPDATE OR DELETE ON identity_handles
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
CREATE TRIGGER invalidate_harness_person_profile AFTER UPDATE OR DELETE ON person_profiles
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
