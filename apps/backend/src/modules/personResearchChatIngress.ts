import { createHash, randomUUID } from "node:crypto";

import type { ChatResponseBlock } from "@talent-signal/contracts";

import type { PersonResearchAgentProviding } from "./personResearchAgentClient.js";
import { personResearchChatBlock } from "./personResearchChat.js";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type PersonResearchChatStatus =
  | "disabled"
  | "completed"
  | "no_action"
  | "unavailable"
  | "unsupported_media"
  | "failed";

export interface PersonResearchChatMedia {
  id: string;
  media_type: string;
}

export function personResearchRunID(
  accountID: string,
  idempotencyKey: string,
): string {
  const bytes = createHash("sha256")
    .update("talent-signal.person-research.v1\0")
    .update(accountID)
    .update("\0")
    .update(idempotencyKey)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function failureBlock(title: string, body: string): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind: "failure_recovery",
    title,
    body,
    status: "failed",
    citation_dependency_ids: [],
    requires_user_decision: false,
  };
}

export async function runPersonResearchChatIngress(input: {
  provider: PersonResearchAgentProviding | null;
  media: readonly PersonResearchChatMedia[];
  loadMedia: (mediaID: string) => Promise<Uint8Array>;
  runID: string;
  objective: string;
}): Promise<{
  status: PersonResearchChatStatus;
  block: ChatResponseBlock | null;
}> {
  if (!input.provider || input.media.length === 0) {
    return { status: "disabled", block: null };
  }
  const media = input.media[0];
  if (
    input.media.length !== 1 ||
    !media ||
    !SUPPORTED_IMAGE_TYPES.has(media.media_type)
  ) {
    return {
      status: "unsupported_media",
      block: failureBlock(
        "Public profile research needs one supported screenshot",
        "Send one PNG, JPEG, or WebP screenshot in a turn. No identity was researched or confirmed, and no external action occurred.",
      ),
    };
  }
  try {
    const research = await input.provider.research({
      runID: input.runID,
      objective: input.objective,
      image: {
        mediaType: media.media_type as "image/png" | "image/jpeg" | "image/webp",
        data: await input.loadMedia(media.id),
      },
    });
    return {
      status: research.result.kind === "artifact"
        ? "completed"
        : research.result.kind,
      block: personResearchChatBlock(research),
    };
  } catch {
    return {
      status: "failed",
      block: failureBlock(
        "Public profile research unavailable",
        "The local Agent did not complete this screenshot Run. The relationship summary remains available; no identity was confirmed and no external action occurred.",
      ),
    };
  }
}
