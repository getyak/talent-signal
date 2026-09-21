/**
 * Zhipu Chat multimodal request assembly and observation redaction.
 *
 * Kept out of `chatAnswerProvider.ts` so that hotspot stays within its reviewed
 * line budget. The provider fetch still receives original pixels; only the
 * diagnostic/observation copies are stripped of base64 and data URLs.
 */

import { diagnosticContent } from "./productRunCapture.js";
import type { AgentProviderInputPart } from "./types.js";

export type UserImagePart = Extract<AgentProviderInputPart, { kind: "image" }>;

export function userImageParts(
  parts: readonly AgentProviderInputPart[] | undefined,
): UserImagePart[] {
  return (parts ?? []).filter(
    (part): part is UserImagePart => part.kind === "image",
  );
}

export function userImageNotes(
  parts: readonly AgentProviderInputPart[] | undefined,
): Array<{ artifact_id: string; text: string }> {
  return (parts ?? [])
    .filter((part): part is Extract<AgentProviderInputPart, { kind: "text" }> => part.kind === "text")
    .map((part) => ({ artifact_id: part.artifactID, text: part.text }));
}

export function agentImageModel(
  images: readonly UserImagePart[],
  visionModel: string | null | undefined,
  model: string,
): string {
  if (images.length > 0 && !visionModel) {
    throw new Error("Remote Chat Agent image processing is not admitted.");
  }
  if (images.length > 10) {
    throw new Error("Remote Chat Agent accepts at most ten governed images.");
  }
  if (images.reduce((total, part) => total + part.byteSize, 0) > 30 * 1024 * 1024) {
    throw new Error("Remote Chat Agent images exceed the governed processing limit.");
  }
  return images.length > 0 ? visionModel! : model;
}

export function buildAgentUserContent(
  payload: Record<string, unknown>,
  images: readonly UserImagePart[],
  parts: readonly AgentProviderInputPart[] | undefined,
): unknown {
  const serialized = JSON.stringify({
    ...payload,
    input_images: images.map((part) => ({
      artifact_id: part.artifactID,
      mime_type: part.mimeType,
      byte_size: part.byteSize,
      content_hash: part.contentHash,
    })),
    input_notes: userImageNotes(parts),
  });
  if (images.length === 0) return serialized;
  return [
    { type: "text", text: serialized },
    ...images.map((part) => ({
      type: "image_url",
      image_url: { url: `data:${part.mimeType};base64,${part.dataBase64}` },
    })),
  ];
}

/** Strip original media/base64 from any value before a raw observation seam. */
export function redactObservationMedia(value: unknown): unknown {
  return diagnosticContent(value);
}

/** One unscoped workspace user turn with its ordered image provenance. */
export function zhipuAgentUserTurn(
  parts: readonly AgentProviderInputPart[] | undefined,
  payload: Record<string, unknown>,
): unknown {
  return buildAgentUserContent(payload, userImageParts(parts), parts);
}
