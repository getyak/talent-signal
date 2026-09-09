ALTER TABLE accounts ADD COLUMN owner_user_id uuid;
ALTER TABLE accounts ADD COLUMN settings_revision integer NOT NULL DEFAULT 1 CHECK (settings_revision > 0);
ALTER TABLE users ADD COLUMN profile_revision integer NOT NULL DEFAULT 1 CHECK (profile_revision > 0);
ALTER TABLE accounts ADD CONSTRAINT accounts_owner_member_fk
  FOREIGN KEY (id, owner_user_id) REFERENCES users(account_id, id) DEFERRABLE INITIALLY DEFERRED;

-- Only a sole real user in an existing personal workspace has unambiguous ownership.
UPDATE accounts a SET owner_user_id = u.id FROM users u
WHERE a.id=u.account_id AND a.slug LIKE 'personal-%' AND u.status='active'
  AND u.kind IN ('password_human','google_human','apple_human')
  AND (SELECT count(*) FROM users other WHERE other.account_id=a.id)=1;

-- All three registration flows create the workspace before its first user.
-- Keep existing admin/member session contracts stable; ownership is workspace data.
CREATE FUNCTION assign_personal_workspace_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IN ('password_human','google_human','apple_human') THEN
    UPDATE accounts SET owner_user_id=NEW.id WHERE id=NEW.account_id
      AND slug LIKE 'personal-%' AND owner_user_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.account_id=NEW.account_id AND u.id<>NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assign_personal_workspace_owner AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION assign_personal_workspace_owner();

CREATE TABLE account_access_events (
  id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id),
  actor_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('profile','workspace','member','transfer','revoke_session')),
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, actor_user_id, id),
  FOREIGN KEY (account_id, actor_user_id) REFERENCES users(account_id,id)
);
INSERT INTO lab_test_workspace_table_manifest(table_name,scope) VALUES ('account_access_events','account');
CREATE TRIGGER lab_test_workspace_write_guard BEFORE INSERT OR UPDATE ON account_access_events
  FOR EACH ROW EXECUTE FUNCTION lab_test_workspace_write_guard();
