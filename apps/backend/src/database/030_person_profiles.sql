CREATE TABLE person_profiles (
  account_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  headline text NOT NULL CHECK (
    char_length(headline) BETWEEN 1 AND 240
  ),
  summary text NOT NULL CHECK (
    char_length(summary) BETWEEN 1 AND 4000
  ),
  provenance_kind text NOT NULL CHECK (
    provenance_kind = 'user_authored'
  ),
  authored_by_user_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, subject_id),
  FOREIGN KEY (account_id, subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, authored_by_user_id)
    REFERENCES users(account_id, id)
);

CREATE INDEX person_profiles_author_idx
  ON person_profiles(account_id, authored_by_user_id, updated_at DESC);
