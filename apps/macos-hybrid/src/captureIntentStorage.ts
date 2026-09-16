const CAPTURE_INTENT_VERSION = 1;
const CAPTURE_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CAPTURE_INTENT_KEY_PREFIX = "ts.hybrid.capture.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type CaptureIntentRecord = {
  readonly version: typeof CAPTURE_INTENT_VERSION;
  readonly intentId: string;
  readonly createdAt: number;
};

export type CaptureIntentStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;
export type CaptureIntentInventoryStorage = CaptureIntentStorage &
  Pick<Storage, "key" | "length">;
export type CaptureIntentScope = { readonly accountId: string; readonly sessionId: string };

export function captureIntentStorageKey(scope: CaptureIntentScope): string {
  return `${CAPTURE_INTENT_KEY_PREFIX}${scope.accountId}.${scope.sessionId}`;
}

export function retainCaptureIntentScope(
  current: CaptureIntentScope | null,
  status:
    | { readonly state: "verified"; readonly accountId: string; readonly sessionId: string }
    | { readonly state: "stale" | "unbound" | "revoked" },
): CaptureIntentScope | null {
  return status.state === "verified"
    ? { accountId: status.accountId, sessionId: status.sessionId }
    : current;
}

function decodeCaptureIntent(raw: string | null, now: number): CaptureIntentRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CaptureIntentRecord>;
    if (
      value.version !== CAPTURE_INTENT_VERSION ||
      typeof value.intentId !== "string" ||
      !UUID_PATTERN.test(value.intentId) ||
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > now ||
      now - value.createdAt > CAPTURE_INTENT_MAX_AGE_MS
    ) {
      return null;
    }
    return value as CaptureIntentRecord;
  } catch {
    return null;
  }
}

export function loadCaptureIntent(
  storage: CaptureIntentStorage,
  key: string,
  now = Date.now(),
): string | null {
  const raw = storage.getItem(key);
  const record = decodeCaptureIntent(raw, now);
  if (!record && raw !== null) storage.removeItem(key);
  return record?.intentId ?? null;
}

export function saveCaptureIntent(
  storage: CaptureIntentStorage,
  key: string,
  value: string | null,
  expectedIntent?: string,
  now = Date.now(),
): void {
  if (value) {
    if (!UUID_PATTERN.test(value)) throw new Error("capture intent must be a UUID");
    storage.setItem(
      key,
      JSON.stringify({ version: CAPTURE_INTENT_VERSION, intentId: value, createdAt: now }),
    );
    return;
  }
  if (expectedIntent) {
    const current = decodeCaptureIntent(storage.getItem(key), now);
    if (current?.intentId !== expectedIntent) return;
  }
  storage.removeItem(key);
}

/**
 * A verified native binding proves every other scope is obsolete. Keep only
 * the exact current key (and lazily expire it); disconnect passes null to
 * remove every capture identifier.
 */
export function pruneCaptureIntents(
  storage: CaptureIntentInventoryStorage,
  retainedScope: CaptureIntentScope | null,
  now = Date.now(),
): void {
  const retainedKey = retainedScope ? captureIntentStorageKey(retainedScope) : null;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key?.startsWith(CAPTURE_INTENT_KEY_PREFIX)) continue;
    if (key === retainedKey) {
      loadCaptureIntent(storage, key, now);
    } else {
      storage.removeItem(key);
    }
  }
}

/**
 * A stale or unverified native status cannot authorize cross-scope deletion,
 * but corrupt and expired renderer records never need that authority. Sweep
 * only those records while retaining every still-valid scope.
 */
export function sweepExpiredCaptureIntents(
  storage: CaptureIntentInventoryStorage,
  now = Date.now(),
): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key?.startsWith(CAPTURE_INTENT_KEY_PREFIX)) continue;
    loadCaptureIntent(storage, key, now);
  }
}
