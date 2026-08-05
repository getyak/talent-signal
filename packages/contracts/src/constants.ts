export const CONTRACT_VERSION = "2026-08-05.2" as const;
export const SOURCE_RETENTION_POLICY_VERSION = "source-retention.v1" as const;

export const SOURCE_RETENTION_MODES = [
  "ephemeral",
  "evidence_crop",
  "full_source",
] as const;

export const SOURCE_SCOPES = [
  "reviewed_selected_text",
  "reviewed_evidence_crop",
  "full_reviewed_source",
] as const;

export const ASSERTION_FIELDS = [
  "availability",
  "competing_process",
  "decision_deadline",
  "relocation_requirement",
  "work_mode_constraint",
  "work_mode_preference",
] as const;

export const DISPOSITIONS = [
  "propose_action",
  "no_action",
  "clarify",
  "block",
] as const;

export const SIMULATED_CAPABILITY =
  "local.simulated_attention.create" as const;
export const SIMULATED_ADAPTER = "local_deterministic" as const;

export const PROHIBITED_INFERENCE_TERMS = [
  "acceptance_probability",
  "candidate_quality",
  "culture_fit",
  "fit_score",
  "personality",
  "protected_trait",
] as const;
