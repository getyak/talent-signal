-- Runtime trials select approved configuration for one authenticated session.
-- They do not assign online cohorts, grant evidence authority, or write product state.
ALTER TABLE sessions ADD CONSTRAINT sessions_scope_identity UNIQUE (account_id, user_id, id);
CREATE TABLE lab_task_trials (
  id uuid NOT NULL,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  task text NOT NULL CHECK (task IN ('relationship_text','relationship_image','unscoped_chat')),
  request_hash text NOT NULL,
  record jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active','stopped','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, user_id, id),
  FOREIGN KEY (account_id, user_id, auth_session_id) REFERENCES sessions(account_id, user_id, id),
  CHECK (record->>'scope' = 'this_authenticated_session'),
  CHECK (record->>'online_assignment' = 'false'),
  CHECK (expires_at <= created_at + interval '61 minutes')
);
CREATE UNIQUE INDEX lab_task_trials_one_active ON lab_task_trials(account_id,user_id,auth_session_id,task) WHERE status='active';
CREATE INDEX lab_task_trials_retention ON lab_task_trials(created_at);
CREATE TABLE lab_trial_observations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  user_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id,user_id,trial_id) REFERENCES lab_task_trials(account_id,user_id,id) ON DELETE CASCADE,
  UNIQUE(account_id,user_id,trial_id,request_fingerprint)
);
