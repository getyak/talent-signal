const CAPTURE_INTENT_VERSION = 1;
const CAPTURE_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type CaptureIntentRecord = {
  readonly version: typeof CAPTURE_INTENT_VERSION;
  readonly intentId: string;
  readonly createdAt: number;
};

export type SessionStorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

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
  storage: SessionStorageLike,
  key: string,
  now = Date.now(),
): string | null {
  const raw = storage.getItem(key);
  const record = decodeCaptureIntent(raw, now);
  if (!record && raw !== null) storage.removeItem(key);
  return record?.intentId ?? null;
}

export function saveCaptureIntent(
  storage: SessionStorageLike,
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
