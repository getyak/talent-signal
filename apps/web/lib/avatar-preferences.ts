import { isAvatarSeed, isAvatarStyle, isLocalAvatarPhoto, type AvatarPreference, type AvatarStyle } from "./avatar";

export type AvatarSnapshot = { defaultStyle: AvatarStyle; people: Record<string, AvatarPreference> };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export const emptyAvatarPreferences: AvatarSnapshot = { defaultStyle: "initials", people: {} };

export class AvatarPreferenceConflictError extends Error {
  constructor() { super("Avatar preferences changed since editing began"); }
}

export function sameAvatarPreference(a: AvatarPreference | undefined, b: AvatarPreference | undefined) {
  return a?.style === b?.style && a?.photo === b?.photo && a?.seed === b?.seed;
}

function cleanPreference(value: AvatarPreference): AvatarPreference {
  return { style: value.style, ...(value.photo ? { photo: value.photo } : {}), ...(value.seed ? { seed: value.seed } : {}) };
}

function validKey(key: string) { return key === "self" || /^person:[\w-]{1,128}$/u.test(key); }
function validPreference(value: unknown): value is AvatarPreference {
  if (!value || typeof value !== "object") return false;
  const p = value as AvatarPreference;
  return (p.style === "auto" || isAvatarStyle(p.style)) && (p.photo === undefined || isLocalAvatarPhoto(p.photo))
    && (p.seed === undefined || isAvatarSeed(p.seed));
}
function parse(raw: string | null, previous: AvatarSnapshot): AvatarSnapshot {
  try {
    const data = JSON.parse(raw ?? "null");
    if (!data || !isAvatarStyle(data.defaultStyle) || !data.people || typeof data.people !== "object" || Array.isArray(data.people)) return emptyAvatarPreferences;
    return { defaultStyle: data.defaultStyle, people: Object.fromEntries(
      Object.entries(data.people).flatMap(([key, value]) => validKey(key) && validPreference(value)
        ? [[key, sameAvatarPreference(value, previous.people[key]) ? previous.people[key]! : cleanPreference(value)]] : []),
    ) };
  } catch { return emptyAvatarPreferences; }
}

/** Only explicit display choices live here: no names, provider URLs or source images. */
export function createAvatarStore(scope: string, storage: () => Storage) {
  const key = `talent-signal:avatars:v1:${scope}`;
  const listeners = new Set<() => void>();
  let raw: string | null | undefined;
  let snapshot = emptyAvatarPreferences;
  function read(strict = false) {
    try {
      const next = storage().getItem(key);
      if (next !== raw) { raw = next; snapshot = parse(next, snapshot); }
    } catch (error) {
      // Rendering can retain the last readback; a mutation must not overwrite unreadable state.
      if (strict) throw error;
    }
    return snapshot;
  }
  function getSnapshot() { return raw === undefined ? read() : snapshot; }
  function emit() { for (const listener of listeners) listener(); }
  function write(next: AvatarSnapshot) {
    const serialized = JSON.stringify(next);
    storage().setItem(key, serialized); // Commit before notifying; quota failures never appear saved.
    raw = serialized;
    snapshot = next;
    emit();
  }
  return {
    key, getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh() { read(); emit(); },
    save(entity: string, preference: AvatarPreference | undefined, guard?: { expected: AvatarPreference | undefined }) {
      if (!validKey(entity) || (preference !== undefined && !validPreference(preference))) throw new Error("Invalid avatar preference");
      const current = read(true);
      if (guard && !sameAvatarPreference(current.people[entity], guard.expected)) {
        emit();
        throw new AvatarPreferenceConflictError();
      }
      const people = { ...current.people };
      if (preference) people[entity] = cleanPreference(preference);
      else delete people[entity];
      write({ ...current, people });
    },
    setDefault(defaultStyle: AvatarStyle) {
      if (!isAvatarStyle(defaultStyle)) throw new Error("Invalid avatar style");
      write({ ...read(true), defaultStyle });
    },
    clear(expected?: AvatarSnapshot) {
      if (expected && JSON.stringify(read(true)) !== JSON.stringify(expected)) {
        emit();
        throw new AvatarPreferenceConflictError();
      }
      storage().removeItem(key); raw = null; snapshot = emptyAvatarPreferences; emit();
    },
  };
}

export type AvatarStore = ReturnType<typeof createAvatarStore>;

/** Serialize cooperating tabs without retaining extra data; comparisons still protect stale drafts. */
export async function withAvatarStorageLock<T>(store: AvatarStore, change: () => T, signal?: AbortSignal): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(store.key, { signal }, change);
  signal?.throwIfAborted();
  return change();
}
