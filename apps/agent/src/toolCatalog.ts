import { z } from "zod";

import {
  CreateResearchArtifactInputSchema,
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
      "Form one evidence-supported review candidate. This cannot confirm or apply state.",
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
      "Search or read one authenticated-account contact, or stage a review-only contact create/update proposal. Search queries must be grounded in the user's message. This tool cannot apply, merge, message, schedule, or publish anything.",
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
