import { randomUUID } from "node:crypto";

import type { MemoryProposalCandidate } from "@talent-signal/contracts";
import { MemoryProposalCandidateInputSchema } from "@talent-signal/agent";

import type {
  MemoryProposalRegenerator,
  MemoryRegenerationInput,
} from "./memoryReviewStage.js";
import { isWorkspaceConversationAgentProvider } from "./workspaceConversationAgent.js";

const REGENERATION_PROMPT = [
  "You regenerate review-only Memory candidates for one explicitly selected contact.",
  "Use ONLY the admitted original source text, the attached admitted images, and the existing accepted memory text provided in the objective.",
  "Do not invent facts, do not convert a future plan into a completed fact, and do not assess personality, motive, quality, or acceptance.",
  "Return one JSON object and nothing else: {\"items\":[{...}]}. Each item uses this exact shape:",
  "{\"scope\":\"person\"|\"relationship\",\"operation\":\"add\"|\"update\"|\"contest\",\"statement_kind\":\"fact\"|\"source_statement\"|\"user_opinion\",\"display_text\":string,\"speaker\":string|null,\"reporter\":string|null,\"time_status\":\"known\"|\"unknown\"|\"future\"|\"past\",\"sensitivity\":\"normal\"|\"sensitive\",\"source_excerpt\":string,\"source_locator\":object,\"reason\":string}.",
  "For a plaintext candidate, source_excerpt must be an exact contiguous substring of the admitted source text and source_locator must be {\"kind\":\"message\",\"session_id\":null,\"message_id\":null}.",
  "For an image-derived candidate, copy the exact admitted image artifact_id into {\"kind\":\"image_region\",\"artifact_id\":string,\"session_id\":null,\"image_index\":number,\"region\":null} and use a short visible excerpt; never claim it was typed in the message.",
].join(" ");

function parseCandidates(value: unknown): MemoryProposalCandidate[] {
  let payload: unknown = value;
  if (payload && typeof payload === "object" && "body" in payload) {
    const body = (payload as { body?: unknown }).body;
    if (typeof body === "string") {
      const stripped = body.replace(/^```(?:json)?\s*/iu, "").replace(/```\s*$/u, "").trim();
      try {
        payload = JSON.parse(stripped);
      } catch {
        return [];
      }
    }
  }
  if (!payload || typeof payload !== "object" || !("items" in payload)) return [];
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const candidates: MemoryProposalCandidate[] = [];
  for (const item of items) {
    const parsed = MemoryProposalCandidateInputSchema.safeParse(item);
    if (parsed.success) {
      candidates.push(parsed.data as unknown as MemoryProposalCandidate);
    }
  }
  return candidates;
}

/**
 * Real backend regenerate consumer. The bounded workspace provider proposes
 * candidates against the original admitted source and the newly selected
 * target; the caller writes them outside the provider call under a version
 * guard. Returns null when the configured provider cannot run Agents.
 */
export function createMemoryProposalRegenerator(
  provider: unknown,
): MemoryProposalRegenerator | null {
  if (!isWorkspaceConversationAgentProvider(provider)) return null;
  return async (input: MemoryRegenerationInput) => {
    if (input.images.length > 0 && !provider.inputCapabilities.image) {
      throw new Error(
        "MEMORY_REGENERATION_IMAGE_UNSUPPORTED: the configured provider cannot view the admitted images.",
      );
    }
    const objective = JSON.stringify({
      instruction:
        "Regenerate Memory candidates for the selected contact from the admitted source only.",
      target_person_label: input.targetDisplayLabel,
      relationship_label: input.relationshipDisplayLabel,
      admitted_source_text: input.sourceText,
      admitted_images: input.images.map((image) => ({
        artifact_id: image.artifactId,
        image_index: image.imageIndex,
        content_hash: image.contentHash,
      })),
      existing_accepted_memory: input.existingMemoryTexts,
    });
    const inputParts = input.images.map((image) => ({
      kind: "image" as const,
      artifactID: image.artifactId,
      mimeType: image.contentType,
      byteSize: Buffer.from(image.dataBase64, "base64").byteLength,
      contentHash: image.contentHash,
      dataBase64: image.dataBase64,
    }));
    const result = await provider.run(
      {
        runID: randomUUID(),
        objective,
        sessionTitleRequested: false,
        systemPrompt: REGENERATION_PROMPT,
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: input.workspaceID,
          sessionID: input.sessionId,
          currentPersonID: input.targetPersonId,
          currentRelationshipContextID: input.targetContextId,
        },
        toolManifest: [],
        ...(inputParts.length > 0 ? { inputParts } : {}),
        budget: {
          maxTurns: 1,
          maxToolCalls: 1,
          maxDurationMs: 30_000,
          maxTaskTokens: 6_000,
          maxEstimatedUsd: 0.05,
        },
      },
      async (name) => ({
        ok: false,
        callID: randomUUID(),
        name,
        error: { code: "TOOL_NOT_ALLOWED", message: "No tools in Memory regeneration." },
      }),
      new AbortController().signal,
    );
    return parseCandidates(result.structuredOutput);
  };
}
