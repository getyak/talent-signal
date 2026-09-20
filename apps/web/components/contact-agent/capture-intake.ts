// Pure intake helpers shared by the capture composer. Keeping validation,
// paste/drop routing and admission/staleness gates here makes the sensitive
// screenshot boundary testable without rendering the whole workspace.

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10_000_000;
export const MAX_TOTAL_ATTACHMENT_BYTES = 30_000_000;

export type SizedFile = {
  readonly type: string;
  readonly size: number;
};

export type AttachmentBatchResult<T extends SizedFile> =
  | { readonly ok: true; readonly accepted: readonly T[] }
  | { readonly ok: false; readonly error: string; readonly accepted: readonly [] };

/**
 * Validate one dropped/selected batch transactionally. An invalid batch is
 * refused as a whole so the already-attached screenshots are preserved.
 */
export function validateAttachmentBatch<T extends SizedFile>(
  existing: readonly SizedFile[],
  incoming: readonly T[],
): AttachmentBatchResult<T> {
  if (incoming.length === 0) return { ok: true, accepted: incoming };

  if (existing.length + incoming.length > MAX_ATTACHMENTS) {
    return {
      ok: false,
      error: `每次最多添加 ${MAX_ATTACHMENTS} 张截图。`,
      accepted: [],
    };
  }

  const acceptedTypes = ACCEPTED_IMAGE_TYPES as readonly string[];
  const invalid = incoming.some(
    (file) =>
      !acceptedTypes.includes(file.type) ||
      file.size <= 0 ||
      file.size > MAX_ATTACHMENT_BYTES,
  );
  if (invalid) {
    return {
      ok: false,
      error: "请选择 10 MB 以内的 PNG、JPEG 或 WebP 截图。",
      accepted: [],
    };
  }

  const total = [...existing, ...incoming].reduce(
    (sum, file) => sum + file.size,
    0,
  );
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: "截图总计不能超过 30 MB，请分开发送。",
      accepted: [],
    };
  }

  return { ok: true, accepted: incoming };
}

/**
 * Paste must never hijack normal text entry, so the scoped composer routes a
 * clipboard payload only when the focused element is not an editable field.
 * The argument is intentionally `unknown` so callers can pass `event.target`
 * directly and tests can pass plain objects.
 */
export function targetsTextEntry(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
  };
  if (candidate.isContentEditable === true) return true;
  const tag =
    typeof candidate.tagName === "string" ? candidate.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export type ClipboardEntry = {
  readonly kind: string;
  readonly type: string;
  readonly getAsFile: () => File | null;
};

/** Extract only real image clipboard entries; text-only pastes stay untouched. */
export function imageFilesFromClipboard(
  entries: readonly ClipboardEntry[] | null | undefined,
): File[] {
  const files: File[] = [];
  for (const entry of entries ?? []) {
    if (entry.kind !== "file" || !entry.type.startsWith("image/")) continue;
    const file = entry.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

/**
 * Directory-only drops surface as file entries without a readable file. The
 * composer uses this to refuse them truthfully instead of silently doing
 * nothing or navigating away.
 */
export function dataTransferHasFileEntries(
  entries: readonly { readonly kind: string }[] | null | undefined,
): boolean {
  for (const entry of entries ?? []) {
    if (entry.kind === "file") return true;
  }
  return false;
}

/**
 * Prefer an existing request attempt so an unknown POST failure retries with
 * the same idempotency key and payload; only build a new one when none exists.
 */
export function reuseOrCreateAttempt<T>(current: T | null, build: () => T): T {
  return current ?? build();
}

/** Synchronous guard against a rapid double activation admitting two requests. */
export class AdmissionGuard {
  private inFlight = false;

  tryEnter(): boolean {
    if (this.inFlight) return false;
    this.inFlight = true;
    return true;
  }

  leave(): void {
    this.inFlight = false;
  }

  get pending(): boolean {
    return this.inFlight;
  }
}

/**
 * Monotonic token gate. Any newer selection (another task, the new-source
 * composer, or a changed account scope) advances the token, so a late response
 * from the previous selection is ignored with `isCurrent`.
 */
export class SelectionGate {
  private token = 0;

  begin(): number {
    this.token += 1;
    return this.token;
  }

  cancel(): void {
    this.token += 1;
  }

  isCurrent(token: number): boolean {
    return token === this.token;
  }
}
