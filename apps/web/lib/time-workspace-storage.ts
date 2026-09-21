import { TimeScheduleMutationRequestSchema, TimeScheduleDeleteRequestSchema, type TimeScheduleMutationRequest, type TimeScheduleDeleteRequest } from "@talent-signal/contracts";
import { matchesTypeBox } from "./typebox-validation";
export type PendingScheduleReceipt = { id: string; key: string; method: "PUT" | "DELETE"; expectedRevision: number; expires: number; body: TimeScheduleMutationRequest | TimeScheduleDeleteRequest };
const storageKey = (binding: string) => `talent-signal:time-operation:${binding}`;
export function rememberTimeOperation(binding: string, receipt: PendingScheduleReceipt): boolean {
  try {
    const existing = pendingTimeOperation(binding);
    if (existing && (existing.id !== receipt.id || existing.key !== receipt.key || JSON.stringify(existing.body) !== JSON.stringify(receipt.body))) return false;
    sessionStorage.setItem(storageKey(binding), JSON.stringify(receipt)); return true;
  } catch { return false; }
}
export function pendingTimeOperation(binding: string): PendingScheduleReceipt | null {
  try {
    const raw = sessionStorage.getItem(storageKey(binding));
    if (!raw) return null;
    const result = JSON.parse(raw) as PendingScheduleReceipt;
    if (!/^[0-9a-f-]{36}$/iu.test(result.id) || !/^[0-9a-f-]{36}$/iu.test(result.key) || !["PUT", "DELETE"].includes(result.method) || !Number.isInteger(result.expectedRevision) || result.expires < Date.now() || result.expires > Date.now() + 86400000 || !matchesTypeBox(result.method === "PUT" ? TimeScheduleMutationRequestSchema : TimeScheduleDeleteRequestSchema, result.body) || result.body.idempotency_key !== result.key || result.body.expected_revision !== result.expectedRevision) { clearTimeOperation(binding); return null; }
    return result;
  } catch { return null; }
}
export function clearTimeOperation(binding: string, expected?: { id: string; key?: string }) {
  try {
    const raw = sessionStorage.getItem(storageKey(binding));
    if (expected && raw) { const value = JSON.parse(raw); if (value.id !== expected.id || expected.key && value.key !== expected.key) return; }
    sessionStorage.removeItem(storageKey(binding));
  } catch { /* The tab-local recovery intent expires within one day. */ }
}

export type TimeEditorFields = { title: string; note: string; person: string; start: string; end: string; zone: string; allDay: boolean; kind: "meeting" | "reminder"; reminder: string; status: "planned" | "completed" | "cancelled" };
export type TimeEditorDraft = { id: string; existing: boolean; base_revision: number; fields: TimeEditorFields; expires: number };
const editKey = (binding: string) => `talent-signal:time-edit:${binding}`;
export function readTimeEditorDraft(binding: string): TimeEditorDraft | null {
  try {
    const raw = sessionStorage.getItem(editKey(binding)); if (!raw) return null;
    const value = JSON.parse(raw) as TimeEditorDraft, f = value.fields;
    if (!value || !/^[0-9a-f-]{36}$/iu.test(value.id) || typeof value.existing !== "boolean" || !Number.isInteger(value.base_revision) || value.base_revision < 0 || !Number.isFinite(value.expires) || value.expires < Date.now() || value.expires > Date.now() + 86400000 || !f ||
      !["title", "note", "person", "start", "end", "zone", "reminder"].every((key) => typeof f[key as keyof TimeEditorFields] === "string") ||
      f.title.length > 200 || f.note.length > 2000 || f.zone.length > 100 || f.person.length > 36 || f.start.length > 32 || f.end.length > 32 || typeof f.allDay !== "boolean" || !["meeting", "reminder"].includes(f.kind) || !["planned", "completed", "cancelled"].includes(f.status) || !["none", "0", "5", "15", "30", "60"].includes(f.reminder)) {
      clearTimeEditorDraft(binding); return null;
    }
    return value;
  } catch { return null; }
}
export function rememberTimeEditorDraft(binding: string, draft: TimeEditorDraft): boolean {
  try { const existing = readTimeEditorDraft(binding); if (existing && existing.id !== draft.id) return false; sessionStorage.setItem(editKey(binding), JSON.stringify(draft)); return true; } catch { return false; }
}
export function clearTimeEditorDraft(binding: string, id?: string) {
  try { const raw = sessionStorage.getItem(editKey(binding)); if (id && raw && JSON.parse(raw).id !== id) return; sessionStorage.removeItem(editKey(binding)); } catch { /* no automatic mutation */ }
}
/** Normal logout clears all old bindings, including intents no longer rendered. */
export function clearTimeWorkspaceStorage() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith("talent-signal:time-operation:") || key.startsWith("talent-signal:time-edit:")) sessionStorage.removeItem(key); } catch { /* unavailable storage contains no recoverable intent */ }
}
export function purgeExpiredTimeWorkspaceStorage() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith("talent-signal:time-operation:") || key.startsWith("talent-signal:time-edit:")) { try { const value = JSON.parse(sessionStorage.getItem(key)!); if (!Number.isFinite(value.expires) || value.expires < Date.now()) sessionStorage.removeItem(key); } catch { sessionStorage.removeItem(key); } } } catch { /* unavailable storage */ }
}
