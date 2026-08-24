ALTER TABLE pursuit_actions
  ADD COLUMN outcome_summary text,
  ADD COLUMN completed_at timestamptz,
  ADD CONSTRAINT pursuit_actions_completion_truth_check CHECK (
    (
      status = 'completed'
      AND outcome_summary IS NOT NULL
      AND length(trim(outcome_summary)) > 0
      AND completed_at IS NOT NULL
    )
    OR
    (
      status <> 'completed'
      AND outcome_summary IS NULL
      AND completed_at IS NULL
    )
  );
