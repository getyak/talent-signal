export const CONTRACT_VERSION = "2026-08-24.10" as const;
export const SOURCE_RETENTION_POLICY_VERSION = "source-retention.v2" as const;

export const SOURCE_RETENTION_MODES = [
  "ephemeral",
  "evidence_crop",
  "full_source",
] as const;

export const SOURCE_RETENTION_RECEIPT_MODES = [
  ...SOURCE_RETENTION_MODES,
  "legacy_unknown",
] as const;

export const SOURCE_SCOPES = [
  "reviewed_selected_text",
  "reviewed_evidence_crop",
  "reviewed_extracted_text",
  "proposed_extracted_text",
  "full_reviewed_source",
] as const;

export const SOURCE_RETENTION_RECEIPT_SCOPES = [
  ...SOURCE_SCOPES,
  "legacy_unknown",
] as const;

export const ASSERTION_FIELDS = [
  "availability",
  "competing_process",
  "current_employer",
  "current_role",
  "decision_deadline",
  "location",
  "notice_period",
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
export const SIMULATED_REVERSAL_CAPABILITY =
  "local.simulated_attention.delete" as const;
export const SIMULATED_ADAPTER = "local_deterministic" as const;

export const PROHIBITED_INFERENCE_TERMS = [
  "acceptance_probability",
  "candidate_quality",
  "culture_fit",
  "fit_score",
  "personality",
  "protected_trait",
] as const;

export const INPUT_CHANNELS = [
  "chat",
  "web_upload",
  "browser_extension",
  "ios_share",
  "api_connector",
] as const;

export const SOURCE_RESOURCE_KINDS = [
  "conversation_screenshot",
  "conversation_transcript",
  "resume",
  "document",
  "public_url",
  "personal_note",
  "contact_record",
] as const;

export const EVIDENCE_FRAGMENT_KINDS = [
  "message",
  "page_text",
  "document_text",
  "document_region",
  "url_excerpt",
  "note_revision",
  "contact_field",
] as const;

export const IDENTITY_HANDLE_TYPES = [
  "email",
  "phone",
  "wechat",
  "linkedin_url",
  "public_profile_url",
  "source_native_id",
] as const;

export const KNOWLEDGE_BLOCK_TYPES = [
  "identity_context",
  "current_dependency",
  "decision_driver",
  "constraint",
  "commitment",
  "deadline",
  "meaningful_change",
  "open_question",
  "conflict",
  "professional_history",
  "sourced_research",
  "relationship_history",
  "observed_outcome",
  "next_action",
  "no_action",
] as const;

export const KNOWLEDGE_DEPENDENCY_TYPES = [
  "identity_binding",
  "relationship_context",
  "source_resource",
  "evidence_fragment",
  "fact_version",
  "research_snapshot",
  "observed_outcome",
  "approved_procedure",
] as const;

export const CHAT_RESPONSE_BLOCK_KINDS = [
  "answer",
  "question_set",
  "clarification",
  "person_brief",
  "source_receipt",
  "identity_review",
  "fact_review",
  "conflict_review",
  "research_status",
  "person_research",
  "action_proposal",
  "active_action",
  "no_action",
  "failure_recovery",
] as const;
