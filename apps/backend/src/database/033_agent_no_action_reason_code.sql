ALTER TABLE agent_no_actions
  ADD COLUMN reason_code text;

UPDATE agent_no_actions
SET reason_code = 'INSUFFICIENT_EVIDENCE'
WHERE reason_code IS NULL;

ALTER TABLE agent_no_actions
  ALTER COLUMN reason_code SET NOT NULL,
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
