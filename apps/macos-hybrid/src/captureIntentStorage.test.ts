import { describe, expect, it } from "vitest";

import { loadCaptureIntent, saveCaptureIntent, type SessionStorageLike } from "./captureIntentStorage";

function fixtureStorage(): SessionStorageLike & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("capture intent storage", () => {
  it("compare-and-removes only the exact settled generation", () => {
    const storage = fixtureStorage();
    const key = "capture";
    const oldIntent = "15f0558a-8e28-49e3-bc60-fbbc315a7f5d";
    const newIntent = "7c056594-dc87-48aa-938d-7b4ba8de7f28";
    saveCaptureIntent(storage, key, oldIntent, undefined, 1_000);
    saveCaptureIntent(storage, key, newIntent, undefined, 2_000);

    saveCaptureIntent(storage, key, null, oldIntent, 2_001);

    expect(loadCaptureIntent(storage, key, 2_002)).toBe(newIntent);
  });

  it("expires a stale recovery intent instead of replaying it forever", () => {
    const storage = fixtureStorage();
    const key = "capture";
    const intent = "15f0558a-8e28-49e3-bc60-fbbc315a7f5d";
    saveCaptureIntent(storage, key, intent, undefined, 1_000);

    expect(loadCaptureIntent(storage, key, 1_000 + 24 * 60 * 60 * 1000 + 1)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });
});
