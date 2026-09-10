-- The generation row must be committed before a first SDK turn. Inserting it
-- inside the long mirror transaction hides a waiting first-source revocation.
CREATE FUNCTION initialize_harness_source_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO harness_source_generations(account_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_harness_source_generation AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION initialize_harness_source_generation();
INSERT INTO harness_source_generations(account_id) SELECT id FROM accounts ON CONFLICT DO NOTHING;
