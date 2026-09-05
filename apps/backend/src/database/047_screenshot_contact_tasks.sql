CREATE TABLE screenshot_contact_tasks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  input_manifest jsonb NOT NULL,
  state jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('running','waiting_for_user','completed','partial','failed','cancelled','deleted')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  lease_epoch integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  subject_id uuid,
  assignment_id uuid,
  capture_id uuid,
  source_resource_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,id),
  UNIQUE (account_id,created_by_user_id,idempotency_key),
  FOREIGN KEY (account_id,created_by_user_id) REFERENCES users(account_id,id),
  FOREIGN KEY (account_id,subject_id) REFERENCES subjects(account_id,id),
  FOREIGN KEY (account_id,assignment_id) REFERENCES assignments(account_id,id),
  FOREIGN KEY (account_id,capture_id) REFERENCES captures(account_id,id),
  FOREIGN KEY (account_id,source_resource_id) REFERENCES source_resources(account_id,id)
);
CREATE INDEX screenshot_contact_tasks_recovery_idx ON screenshot_contact_tasks(status,lease_until)
  WHERE status = 'running';

-- Model observations are deliberately separate from the user-authored profile.
CREATE TABLE contact_profile_observations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  task_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  observation_hash text NOT NULL,
  observation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id,task_id,observation_hash),
  FOREIGN KEY (account_id,subject_id) REFERENCES subjects(account_id,id),
  FOREIGN KEY (account_id,assignment_id) REFERENCES assignments(account_id,id),
  FOREIGN KEY (account_id,task_id) REFERENCES screenshot_contact_tasks(account_id,id),
  FOREIGN KEY (account_id,capture_id) REFERENCES captures(account_id,id)
);
CREATE INDEX contact_profile_observations_person_idx ON contact_profile_observations(account_id,subject_id,created_at DESC);

CREATE FUNCTION purge_screenshot_contact_derivatives() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.authorization_state <> 'authorized' OR NEW.source_access_state IN ('purged','deleted') THEN
    DELETE FROM contact_profile_observations WHERE account_id=NEW.account_id AND capture_id=NEW.capture_id;
    UPDATE screenshot_contact_tasks SET state='{}'::jsonb,input_manifest='{}'::jsonb,
      status='deleted',revision=revision+1,lease_epoch=lease_epoch+1,lease_until=NULL,updated_at=now()
      WHERE account_id=NEW.account_id AND capture_id=NEW.capture_id AND status <> 'deleted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purge_screenshot_contact_derivatives_trigger
  AFTER UPDATE OF authorization_state,source_access_state ON source_retention_receipts
  FOR EACH ROW EXECUTE FUNCTION purge_screenshot_contact_derivatives();
