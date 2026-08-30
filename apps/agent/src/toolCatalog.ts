import { z } from "zod";

import {
  CreateResearchArtifactInputSchema,
  FetchWebInputSchema,
  ReadEvidenceInputSchema,
  ReadPursuitInputSchema,
  SearchWebInputSchema,
  StageProposalInputSchema,
} from "./schemas.js";
import type { AgentToolName } from "./types.js";

export type AgentCapabilityClass =
  | "scoped_read"
  | "public_discovery"
  | "public_fetch"
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
  return manifest.includes("create_research_artifact")
    ? ["create_research_artifact"]
    : ["stage_pursuit_proposal"];
}

export function agentCapabilityManifest(manifest: readonly AgentToolName[]) {
  return manifest.map((name) => ({ name, ...AGENT_TOOL_CATALOG[name] }));
}
