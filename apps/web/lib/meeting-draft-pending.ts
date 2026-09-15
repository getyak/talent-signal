export type PendingMeetingDraftEdit = {
  v: 1;
  draftId: string;
  sessionVersion: string;
  idempotencyKey: string;
  expectedRevision: number;
  title: string;
  start: string;
  end: string;
  expiresAt: string;
  savedAt: string;
};

export type PendingMeetingDraftDismiss = {
  v: 1;
  draftId: string;
  sessionVersion: string;
  idempotencyKey: string;
  expectedRevision: number;
  expiresAt: string;
  savedAt: string;
};

const EDIT_PREFIX = "talent-signal:meeting-draft-pending:v1:";
const DISMISS_PREFIX = "talent-signal:meeting-draft-dismiss:v1:";
const PREFIXES = [EDIT_PREFIX, DISMISS_PREFIX] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/u;
const AUTHORITATIVE_DISMISS_REJECTIONS: Readonly<Record<number, ReadonlySet<string>>> = {
  400: new Set(["meeting_draft_invalid", "MEETING_DRAFT_INVALID"]),
  401: new Set(["backend_session_expired", "AUTHENTICATION_REQUIRED", "SESSION_INVALID"]),
  403: new Set(["origin_rejected", "DEPLOYMENT_WORKSPACE_NOT_ADMITTED"]),
  404: new Set(["MEETING_DRAFT_NOT_FOUND"]),
  409: new Set([
    "session_stale",
    "MEETING_DRAFT_ALREADY_DISMISSED",
    "MEETING_DRAFT_INTENT_CONFLICT",
    "MEETING_DRAFT_OPERATION_SUPERSEDED",
    "MEETING_DRAFT_REVISION_CONFLICT",
    "MEETING_DRAFT_SOURCE_MISMATCH",
    "MEETING_DRAFT_SOURCE_UNAVAILABLE",
    "MEETING_DRAFT_UNAVAILABLE",
  ]),
  415: new Set(["invalid_content_type"]),
};

export function meetingDraftDismissRejectionIsAuthoritative(
  status: number,
  code: unknown,
): boolean {
  return typeof code === "string" &&
    (AUTHORITATIVE_DISMISS_REJECTIONS[status]?.has(code) ?? false);
}

export function meetingDraftIntentIsKnownClean(
  next: { title: string; starts_at: string; ends_at: string },
  known: { title: string; starts_at: string; ends_at: string },
  hasUnknownServerOutcome: boolean,
): boolean {
  return !hasUnknownServerOutcome &&
    next.title === known.title &&
    next.starts_at === known.starts_at &&
    next.ends_at === known.ends_at;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function editKey(draftId: string, sessionVersion: string): string {
  return `${EDIT_PREFIX}${sessionVersion}:${draftId}`;
}

function dismissKey(draftId: string, sessionVersion: string): string {
  return `${DISMISS_PREFIX}${sessionVersion}:${draftId}`;
}

function valid(value: unknown): value is PendingMeetingDraftEdit {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PendingMeetingDraftEdit>;
  return item.v === 1 &&
    typeof item.draftId === "string" && UUID.test(item.draftId) &&
    typeof item.sessionVersion === "string" && item.sessionVersion.length > 0 && item.sessionVersion.length <= 256 &&
    typeof item.idempotencyKey === "string" && UUID.test(item.idempotencyKey) &&
    Number.isInteger(item.expectedRevision) && Number(item.expectedRevision) >= 1 &&
    typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 200 &&
    typeof item.start === "string" && LOCAL_TIME.test(item.start) &&
    typeof item.end === "string" && LOCAL_TIME.test(item.end) &&
    typeof item.expiresAt === "string" && Number.isFinite(Date.parse(item.expiresAt)) &&
    typeof item.savedAt === "string" && Number.isFinite(Date.parse(item.savedAt));
}

function validDismiss(value: unknown): value is PendingMeetingDraftDismiss {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PendingMeetingDraftDismiss>;
  return item.v === 1 &&
    typeof item.draftId === "string" && UUID.test(item.draftId) &&
    typeof item.sessionVersion === "string" && item.sessionVersion.length > 0 && item.sessionVersion.length <= 256 &&
    typeof item.idempotencyKey === "string" && UUID.test(item.idempotencyKey) &&
    Number.isInteger(item.expectedRevision) && Number(item.expectedRevision) >= 1 &&
    typeof item.expiresAt === "string" && Number.isFinite(Date.parse(item.expiresAt)) &&
    typeof item.savedAt === "string" && Number.isFinite(Date.parse(item.savedAt));
}

function isIntentKey(itemKey: string | null): itemKey is string {
  return Boolean(itemKey && PREFIXES.some((prefix) => itemKey.startsWith(prefix)));
}

function intentIdentity(value: unknown): {
  draftId: string;
  expiresAt: string;
  sessionVersion: string;
} | null {
  return valid(value) || validDismiss(value)
    ? {
        draftId: value.draftId,
        expiresAt: value.expiresAt,
        sessionVersion: value.sessionVersion,
      }
    : null;
}

export function readPendingMeetingDraftEdit(
  draftId: string,
  sessionVersion: string,
): PendingMeetingDraftEdit | null {
  const target = storage();
  if (!target) return null;
  const itemKey = editKey(draftId, sessionVersion);
  try {
    const value = JSON.parse(target.getItem(itemKey) ?? "null");
    if (
      !valid(value) ||
      value.draftId !== draftId ||
      value.sessionVersion !== sessionVersion ||
      Date.parse(value.expiresAt) <= Date.now()
    ) {
      target.removeItem(itemKey);
      return null;
    }
    return value;
  } catch {
    target.removeItem(itemKey);
    return null;
  }
}

export function writePendingMeetingDraftEdit(value: PendingMeetingDraftEdit): boolean {
  const target = storage();
  if (!target) return false;
  const itemKey = editKey(value.draftId, value.sessionVersion);
  try {
    target.setItem(itemKey, JSON.stringify(value));
    return true;
  } catch {
    // A failed replacement must never leave an older, now-superseded intent
    // eligible for automatic recovery after a reload.
    try { target.removeItem(itemKey); } catch { /* Storage is unavailable. */ }
    return false;
  }
}

export function clearPendingMeetingDraftEdit(
  draftId: string,
  sessionVersion: string,
): void {
  storage()?.removeItem(editKey(draftId, sessionVersion));
}

export function readPendingMeetingDraftDismiss(
  draftId: string,
  sessionVersion: string,
): PendingMeetingDraftDismiss | null {
  const target = storage();
  if (!target) return null;
  const itemKey = dismissKey(draftId, sessionVersion);
  try {
    const value = JSON.parse(target.getItem(itemKey) ?? "null");
    if (
      !validDismiss(value) ||
      value.draftId !== draftId ||
      value.sessionVersion !== sessionVersion ||
      Date.parse(value.expiresAt) <= Date.now()
    ) {
      target.removeItem(itemKey);
      return null;
    }
    return value;
  } catch {
    target.removeItem(itemKey);
    return null;
  }
}

export function writePendingMeetingDraftDismiss(
  value: PendingMeetingDraftDismiss,
): boolean {
  const target = storage();
  if (!target) return false;
  const itemKey = dismissKey(value.draftId, value.sessionVersion);
  try {
    target.setItem(itemKey, JSON.stringify(value));
    return true;
  } catch {
    try { target.removeItem(itemKey); } catch { /* Storage is unavailable. */ }
    return false;
  }
}

export function clearPendingMeetingDraftDismiss(
  draftId: string,
  sessionVersion: string,
): void {
  storage()?.removeItem(dismissKey(draftId, sessionVersion));
}

export function clearAllPendingMeetingDraftIntents(): void {
  const target = storage();
  if (!target) return;
  for (let index = target.length - 1; index >= 0; index -= 1) {
    const itemKey = target.key(index);
    if (isIntentKey(itemKey)) target.removeItem(itemKey);
  }
}

export function clearOtherMeetingDraftBindings(sessionVersion: string): void {
  const target = storage();
  if (!target) return;
  for (let index = target.length - 1; index >= 0; index -= 1) {
    const itemKey = target.key(index);
    if (!isIntentKey(itemKey)) continue;
    try {
      const value = JSON.parse(target.getItem(itemKey) ?? "null");
      const identity = intentIdentity(value);
      if (!identity || identity.sessionVersion !== sessionVersion) {
        target.removeItem(itemKey);
      }
    } catch {
      target.removeItem(itemKey);
    }
  }
}

export function purgeUnavailableMeetingDraftIntents(
  sessionVersion: string,
  activeDraftIds: ReadonlySet<string>,
): void {
  const target = storage();
  if (!target) return;
  for (let index = target.length - 1; index >= 0; index -= 1) {
    const itemKey = target.key(index);
    if (!isIntentKey(itemKey)) continue;
    try {
      const value = JSON.parse(target.getItem(itemKey) ?? "null");
      const identity = intentIdentity(value);
      if (
        !identity ||
        identity.sessionVersion !== sessionVersion ||
        Date.parse(identity.expiresAt) <= Date.now() ||
        !activeDraftIds.has(identity.draftId)
      ) {
        target.removeItem(itemKey);
      }
    } catch {
      target.removeItem(itemKey);
    }
  }
}
