DROP TABLE IF EXISTS agent_research_artifacts;

ALTER TABLE agent_runs
  DROP CONSTRAINT agent_runs_status_check,
  ADD CONSTRAINT agent_runs_status_check CHECK (
    status IN (
      'starting', 'running', 'proposal_staged', 'no_action', 'quarantined',
      'budget_exhausted', 'cancelled', 'failed'
    )
  );

ALTER TABLE agent_no_actions
  DROP CONSTRAINT agent_no_actions_reason_code_check,
  ADD CONSTRAINT agent_no_actions_reason_code_check CHECK (
    reason_code IN (
      'NO_MATERIAL_CHANGE',
      'INSUFFICIENT_EVIDENCE',
      'UNTRUSTED_INSTRUCTION',
      'AMBIGUOUS_TIME',
      'PROHIBITED_PERSON_ASSESSMENT',
      'UNSUPPORTED_INPUT_CAPABILITY'
    )
  );
