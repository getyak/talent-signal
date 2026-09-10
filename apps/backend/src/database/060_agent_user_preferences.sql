-- User-owned reply formatting, never an inferred candidate characteristic.
CREATE TABLE agent_user_preferences (
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  response_style text NOT NULL CHECK(response_style IN ('default','conclusion_first')),
  revision integer NOT NULL CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(account_id,user_id),
  FOREIGN KEY(account_id,user_id) REFERENCES users(account_id,id) ON DELETE CASCADE
);
-- A reset must also erase old preferences copied into SDK working context.
CREATE TRIGGER invalidate_harness_user_preference AFTER INSERT OR UPDATE OR DELETE ON agent_user_preferences
  FOR EACH ROW EXECUTE FUNCTION invalidate_harness_source_generation();
