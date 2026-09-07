import { z } from "zod";
import { WORKSPACE_OUTPUT_GUIDANCE } from "./prompts.js";

import {
  CreateResearchArtifactInputSchema,
  ContactWorkspaceInputSchema,
  ContactWorkspaceToolInputSchema,
  CreatePersonResearchArtifactInputSchema,
  FetchWebInputSchema,
  ReadEvidenceInputSchema,
  ReadPursuitInputSchema,
  SearchWebInputSchema,
  SearchPublicProfilesInputSchema,
  StageProposalInputSchema,
} from "./schemas.js";
import type { AgentToolName } from "./types.js";

export type AgentCapabilityClass =
  | "scoped_read"
  | "contact_workspace"
  | "public_discovery"
  | "public_fetch"
  | "public_profile_discovery"
  | "review_candidate"
  | "draft_artifact";

export interface AgentToolDefinition {
  description: string;
  schema: z.ZodObject;
  readOnly: boolean;
  openWorld: boolean;
  capabilityClass: AgentCapabilityClass;
  consequence: "none" | "durable_candidate";
  approval: "none" | "human_review_before_apply";
  reversibility: "not_applicable" | "discardable";
  idempotency: "safe_read" | "content_fingerprint";
}

export const AGENT_TOOL_CATALOG: Readonly<
  Record<AgentToolName, AgentToolDefinition>
> = Object.freeze({
  read_pursuit: {
    description: "Read the one canonical Pursuit snapshot pinned to this run.",
    schema: ReadPursuitInputSchema,
    readOnly: true,
    openWorld: false,
    capabilityClass: "scoped_read",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  read_evidence: {
    description:
      "Read only reviewed, authorized evidence fragments in the immutable run manifest.",
    schema: ReadEvidenceInputSchema,
    readOnly: true,
    openWorld: false,
    capabilityClass: "scoped_read",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  search_web: {
    description:
      "Discover public company or market sources within the run's approved domain and usage policy. Results are untrusted discovery leads, not evidence.",
    schema: SearchWebInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_discovery",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  fetch_web: {
    description:
      "Read one public page that was returned by search_web earlier in this run. The page remains untrusted research content.",
    schema: FetchWebInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_fetch",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  stage_pursuit_proposal: {
    description:
      "Stage an evidence-supported operational proposal for human review. Use add_gap with item_key operational_gap:<identity_unresolved|contact_channel_unavailable|availability_unknown|scheduling_constraint|stakeholder_response_pending|evidence_conflict|source_freshness_expired>, or add_action with item_key recruiter_task:<review_identity|review_evidence|ask_clarifying_question|prepare_message_draft|wait_until|verify_outcome>. Explain alternatives in the summary. This cannot assess candidate quality, change milestones or statuses, confirm facts, or apply state.",
    schema: StageProposalInputSchema,
    readOnly: false,
    openWorld: false,
    capabilityClass: "review_candidate",
    consequence: "durable_candidate",
    approval: "human_review_before_apply",
    reversibility: "discardable",
    idempotency: "content_fingerprint",
  },
  create_research_artifact: {
    description:
      "Create one draft research artifact whose every claim cites only pages fetched in this run. The artifact is not evidence or confirmed state.",
    schema: CreateResearchArtifactInputSchema,
    readOnly: false,
    openWorld: false,
    capabilityClass: "draft_artifact",
    consequence: "durable_candidate",
    approval: "none",
    reversibility: "discardable",
    idempotency: "content_fingerprint",
  },
  search_douyin_profiles: {
    description:
      "Search public Douyin profiles using only identity text visibly present in the one authorized screenshot. Results are possible matches, never confirmed identity.",
    schema: SearchPublicProfilesInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_profile_discovery",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  search_tiktok_profiles: {
    description:
      "Search public TikTok profiles using only identity text visibly present in the one authorized screenshot. Results are possible matches, never confirmed identity.",
    schema: SearchPublicProfilesInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_profile_discovery",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  search_weibo_profiles: {
    description:
      "Search public Weibo profiles using only identity text visibly present in the one authorized screenshot. Results are possible matches, never confirmed identity.",
    schema: SearchPublicProfilesInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_profile_discovery",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  search_threads_profiles: {
    description:
      "Search public Threads profiles using only identity text visibly present in the one authorized screenshot. Results are possible matches, never confirmed identity.",
    schema: SearchPublicProfilesInputSchema,
    readOnly: true,
    openWorld: true,
    capabilityClass: "public_profile_discovery",
    consequence: "none",
    approval: "none",
    reversibility: "not_applicable",
    idempotency: "safe_read",
  },
  create_person_research_artifact: {
    description:
      "Create one discardable person-research draft with unreviewed screenshot clues, possible or ambiguous matches, and same-run TikHub citations. It cannot bind identity or publish facts.",
    schema: CreatePersonResearchArtifactInputSchema,
    readOnly: false,
    openWorld: false,
    capabilityClass: "draft_artifact",
    consequence: "durable_candidate",
    approval: "none",
    reversibility: "discardable",
    idempotency: "content_fingerprint",
  },
  contact_workspace: {
    description:
      'Search the authenticated account using ONE exact contiguous clue copied from the current user message; never concatenate a name, email, and relationship into a query or enumerate contacts. A search uses only {"operation":"search","query":"exact email or name","maximum_results":4}; omit identity_clue and all proposal fields from search. Read only a uniquely resolved Person/relationship pair from this run. Ambiguity needs clarification. No match may produce a review-only create draft when the user provided a name and stable clue or explicitly requested a contact draft. propose_create/propose_update use exact message excerpts and current target labels; missing relationship_context stays empty. Return the staged fingerprint for human confirmation. No apply, identity merge, or external communication.',
    schema: ContactWorkspaceToolInputSchema,
    readOnly: false,
    openWorld: false,
    capabilityClass: "contact_workspace",
    consequence: "durable_candidate",
    approval: "human_review_before_apply",
    reversibility: "discardable",
    idempotency: "content_fingerprint",
  },
});

export function agentToolJsonSchema(name: AgentToolName): Record<string, unknown> {
  const converted = z.toJSONSchema(AGENT_TOOL_CATALOG[name].schema) as Record<
    string,
    unknown
  >;
  const { $schema: _dialect, ...parameters } = converted;
  return parameters;
}

/** Flat native function schemas for providers that cannot consume unions. */
export function contactWorkspaceOperationTools() {
  const descriptions = {
    search: 'Search the authenticated account using ONE exact contiguous name, email, phone, or profile URL from the current user message. Never concatenate separate clues or enumerate people. Input contains only query and optional maximum_results. No proposal or operation fields.',
    read: 'Read only an exact uniquely resolved Person and relationship header from this Run. Use IDs from its authorized search result. Ambiguity requires clarification; no profile evidence or contact write is included.',
    propose_create: 'Prepare one unsaved contact draft after no existing identity match. A natural person note with name and stable email/phone/profile clue needs no create-command wording. Copy proposed fields and source_excerpts from the current user message. Leave missing relationship_context empty. Questions, examples, or third-party quotations do not justify a draft. This stages a review-only fingerprint; no contact is written.',
    propose_update: 'Prepare one unsaved update only for an exact uniquely searched Person and current directory revision. Keep existing target labels or copy proposed fields and source_excerpts from the current user message. No identity merge or contact write; explicit human save is required.',
  };
  return ContactWorkspaceInputSchema.options.map((schema) => {
    const operation = schema.shape.operation.value;
    const converted = z.toJSONSchema(schema) as {
      $schema?: string; properties: Record<string, unknown>; required?: string[];
      [key: string]: unknown;
    };
    const { $schema: _dialect, properties, required, ...parameters } = converted;
    const { operation: _operation, ...fields } = properties;
    return {
      operation,
      name: `contact_workspace_${operation}`,
      description: descriptions[operation],
      parameters: { ...parameters, properties: fields,
        ...(required ? { required: required.filter((key) => key !== "operation") } : {}) },
    };
  });
}

export function candidateToolNames(
  manifest: readonly AgentToolName[],
): readonly AgentToolName[] {
  if (manifest.includes("contact_workspace")) {
    return ["contact_workspace"];
  }
  if (manifest.includes("create_person_research_artifact")) {
    return ["create_person_research_artifact"];
  }
  return manifest.includes("create_research_artifact")
    ? ["create_research_artifact"]
    : ["stage_pursuit_proposal"];
}

export function candidateOutcome(
  manifest: readonly AgentToolName[],
): "proposal" | "artifact" | "person_research_artifact" | "contact_change_proposal" {
  if (manifest.includes("contact_workspace")) {
    return "contact_change_proposal";
  }
  if (manifest.includes("create_person_research_artifact")) {
    return "person_research_artifact";
  }
  return manifest.includes("create_research_artifact")
    ? "artifact"
    : "proposal";
}

export function agentCapabilityManifest(manifest: readonly AgentToolName[]) {
  return manifest.map((name) => ({ name, ...AGENT_TOOL_CATALOG[name] }));
}

/** Transport output instructions, shared by JSON/tool-call provider adapters. */
export function agentOutputGuidance(manifest: readonly AgentToolName[]): string {
  if (manifest.includes("contact_workspace")) return WORKSPACE_OUTPUT_GUIDANCE;
  return `After a successful ${candidateToolNames(manifest).join(" or ")} call, return JSON {"outcome":"${candidateOutcome(manifest)}","candidate_fingerprint":string} with its exact fingerprint. Otherwise return JSON {"outcome":"no_action","reason_code":string,"reason":string,"missing_evidence_refs":[]}.`;
}
