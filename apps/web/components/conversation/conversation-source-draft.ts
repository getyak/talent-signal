/**
 * Pure state for the conversation source-intake host.
 *
 * The ordinary conversation home and every Session share one transport: dropped
 * or pasted images are validated transactionally and then handed to the existing
 * contact-agent task composer. Nothing here encodes, uploads, scopes or logs an
 * image; it only decides which File objects may be staged and what the host must
 * retain across a modal close.
 */

import type {
  ScreenshotContactTaskRequest,
  TextContactTaskRequest,
} from "@talent-signal/agent";

import { validateAttachmentBatch } from "@/components/contact-agent/capture-intake";
import type { ComposerMode } from "@/components/contact-agent/contact-agent-workspace";

export type SourceDraft = {
  files: File[];
  objective: string;
  research: boolean;
  text: string;
  inputMode: ComposerMode;
  taskID: string | null;
  submitting: boolean;
  unresolved: boolean;
  imageAttempt: ScreenshotContactTaskRequest | null;
  textAttempt: TextContactTaskRequest | null;
};

export const EMPTY_SOURCE_DRAFT: SourceDraft = {
  files: [],
  objective: "",
  research: false,
  text: "",
  inputMode: "image",
  taskID: null,
  submitting: false,
  unresolved: false,
  imageAttempt: null,
  textAttempt: null,
};

const SOURCE_DRAFT_KEYS: readonly (keyof SourceDraft)[] = [
  "files",
  "objective",
  "research",
  "text",
  "inputMode",
  "taskID",
  "submitting",
  "unresolved",
  "imageAttempt",
  "textAttempt",
];

/** Structural equality so a child draft report cannot re-render forever. */
export function sameSourceDraft(a: SourceDraft, b: SourceDraft): boolean {
  if (a === b) return true;
  return SOURCE_DRAFT_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Validate one new batch against the retained set as a single transaction.
 * A refused batch returns the untouched retained files and the reason; the
 * retained files are never dropped. Distinct File objects are always preserved
 * — filename, size and mtime are not proof that two images are the same.
 */
export function appendValidatedFiles(
  current: readonly File[],
  incoming: readonly File[],
): { files: File[]; error: string | null } {
  if (!incoming.length) return { files: [...current], error: null };
  const result = validateAttachmentBatch(current, incoming);
  if (!result.ok) return { files: [...current], error: result.error };
  return { files: [...current, ...result.accepted], error: null };
}
