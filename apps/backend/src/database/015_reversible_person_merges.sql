ALTER TABLE subjects
  DROP CONSTRAINT subjects_status_check;

ALTER TABLE subjects
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN merged_into_subject_id uuid,
  ADD COLUMN merged_at timestamptz,
  ADD CONSTRAINT subjects_status_check CHECK (
    status IN ('active', 'merged', 'deleted')
  ),
  ADD CONSTRAINT subjects_merged_into_fk
    FOREIGN KEY (account_id, merged_into_subject_id)
    REFERENCES subjects(account_id, id),
  ADD CONSTRAINT subjects_merge_state_check CHECK (
    (
      status = 'merged'
      AND merged_into_subject_id IS NOT NULL
      AND merged_at IS NOT NULL
      AND merged_into_subject_id <> id
    )
    OR
    (
      status <> 'merged'
      AND merged_into_subject_id IS NULL
      AND merged_at IS NULL
    )
  );

CREATE TABLE person_merge_operations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  source_subject_id uuid NOT NULL,
  target_subject_id uuid NOT NULL,
  decided_by_user_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  target_version integer NOT NULL CHECK (target_version > 0),
  preview_digest text NOT NULL CHECK (
    preview_digest ~ '^[a-f0-9]{64}$'
  ),
  reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'reversed')),
  affected_assignment_ids uuid[] NOT NULL,
  affected_capture_ids uuid[] NOT NULL,
  affected_state_ids uuid[] NOT NULL,
  affected_handle_ids uuid[] NOT NULL,
  affected_research_task_ids uuid[] NOT NULL,
  invalidated_snapshot_ids uuid[] NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  reversed_by_user_id uuid,
  reversal_reason text,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, id),
  FOREIGN KEY (account_id, source_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, target_subject_id)
    REFERENCES subjects(account_id, id),
  FOREIGN KEY (account_id, decided_by_user_id)
    REFERENCES users(account_id, id),
  FOREIGN KEY (account_id, reversed_by_user_id)
    REFERENCES users(account_id, id),
  CHECK (source_subject_id <> target_subject_id),
  CHECK (
    (
      status = 'applied'
      AND reversed_by_user_id IS NULL
      AND reversal_reason IS NULL
      AND reversed_at IS NULL
    )
    OR
    (
      status = 'reversed'
      AND reversed_by_user_id IS NOT NULL
      AND reversal_reason IS NOT NULL
      AND reversed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX person_merge_operations_one_active_source_idx
  ON person_merge_operations(account_id, source_subject_id)
  WHERE status = 'applied';

CREATE INDEX person_merge_operations_target_idx
  ON person_merge_operations(account_id, target_subject_id, decided_at DESC);
