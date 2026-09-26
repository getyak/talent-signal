import { isAvatarSeed, isAvatarStyle, isLocalAvatarPhoto, type AvatarPreference, type AvatarStyle } from "./avatar";

type Snapshot = { defaultStyle: AvatarStyle; people: Record<string, AvatarPreference> };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export const emptyAvatarPreferences: Snapshot = { defaultStyle: "initials", people: {} };

function validKey(key: string) { return key === "self" || /^person:[\w-]{1,128}$/u.test(key); }
function validPreference(value: unknown): value is AvatarPreference {
  if (!value || typeof value !== "object") return false;
  const p = value as AvatarPreference;
  return (p.style === "auto" || isAvatarStyle(p.style)) && (p.photo === undefined || isLocalAvatarPhoto(p.photo))
    && (p.seed === undefined || isAvatarSeed(p.seed));
}
function parse(raw: string | null): Snapshot {
  try {
    const data = JSON.parse(raw ?? "null");
    if (!data || !isAvatarStyle(data.defaultStyle) || !data.people || typeof data.people !== "object") return emptyAvatarPreferences;
    return { defaultStyle: data.defaultStyle, people: Object.fromEntries(
      Object.entries(data.people).filter(([key, value]) => validKey(key) && validPreference(value)),
    ) as Snapshot["people"] };
  } catch { return emptyAvatarPreferences; }
}

/** Only explicit display choices live here: no names, provider URLs or source images. */
export function createAvatarStore(scope: string, storage: () => Storage) {
  const key = `talent-signal:avatars:v1:${scope}`;
  const listeners = new Set<() => void>();
  let raw: string | null | undefined;
  let snapshot = emptyAvatarPreferences;
  function read() {
    try {
      const next = storage().getItem(key);
      if (next !== raw) { raw = next; snapshot = parse(next); }
    } catch { /* Unavailable storage keeps rendering the safe in-memory fallback. */ }
    return snapshot;
  }
  function getSnapshot() { return raw === undefined ? read() : snapshot; }
  function emit() { for (const listener of listeners) listener(); }
  function write(next: Snapshot) {
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
    save(entity: string, preference: AvatarPreference | undefined) {
      if (!validKey(entity) || (preference !== undefined && !validPreference(preference))) throw new Error("Invalid avatar preference");
      const current = read();
      const people = { ...current.people };
      if (preference) people[entity] = preference;
      else delete people[entity];
      write({ ...current, people });
    },
    setDefault(defaultStyle: AvatarStyle) {
      if (!isAvatarStyle(defaultStyle)) throw new Error("Invalid avatar style");
      write({ ...read(), defaultStyle });
    },
    clear() { storage().removeItem(key); raw = null; snapshot = emptyAvatarPreferences; emit(); },
  };
}

export type AvatarStore = ReturnType<typeof createAvatarStore>;
