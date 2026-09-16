import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  captureIntentStorageKey,
  loadCaptureIntent,
  pruneCaptureIntents,
  retainCaptureIntentScope,
  saveCaptureIntent,
  sweepExpiredCaptureIntents,
  type CaptureIntentInventoryStorage,
  type CaptureIntentStorage,
} from "./captureIntentStorage";

function fixtureStorage(): CaptureIntentInventoryStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("capture intent storage", () => {
  it("remounts the native workbench when the verified scope changes", () => {
    const first = captureIntentStorageKey({ accountId: "account-a", sessionId: "session-a" });
    const second = captureIntentStorageKey({ accountId: "account-b", sessionId: "session-b" });
    expect(first).not.toBe(second);
    expect(
      readFileSync(new URL("./App.tsx", import.meta.url), "utf8"),
    ).toContain("key={bindingScope}");
  });

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

  it("reuses the exact unknown intent after stale status and verified recovery", () => {
    const storage = fixtureStorage();
    const accountId = "72cf65bf-4b78-40aa-ae7c-21994d93ce70";
    const sessionId = "05dc954c-e7c7-4f6c-a17c-3287e28d40b6";
    const key = `ts.hybrid.capture.${accountId}.${sessionId}`;
    const unknownIntent = "15f0558a-8e28-49e3-bc60-fbbc315a7f5d";
    saveCaptureIntent(storage, key, unknownIntent, undefined, 1_000);

    let scope = retainCaptureIntentScope(
      { accountId, sessionId },
      { state: "stale" },
    );
    expect(scope).toEqual({ accountId, sessionId });
    scope = retainCaptureIntentScope(scope, { state: "verified", accountId, sessionId });

    expect(scope).toEqual({ accountId, sessionId });
    expect(loadCaptureIntent(storage, key, 2_000)).toBe(unknownIntent);
  });

  it("keeps a pending intent in restart-durable storage until exact settlement", () => {
    const durableStorage = fixtureStorage();
    const key = "ts.hybrid.capture.account.session";
    const intent = "15f0558a-8e28-49e3-bc60-fbbc315a7f5d";
    saveCaptureIntent(durableStorage, key, intent, undefined, 1_000);

    const restartedRendererStorage: CaptureIntentStorage = {
      getItem: durableStorage.getItem,
      removeItem: durableStorage.removeItem,
      setItem: durableStorage.setItem,
    };

    expect(loadCaptureIntent(restartedRendererStorage, key, 2_000)).toBe(intent);
    saveCaptureIntent(restartedRendererStorage, key, null, intent, 2_001);
    expect(loadCaptureIntent(durableStorage, key, 2_002)).toBeNull();
  });

  it("removes obsolete scopes after verified rebind recovery", () => {
    const storage = fixtureStorage();
    const oldScope = { accountId: "old-account", sessionId: "old-session" };
    const currentScope = { accountId: "current-account", sessionId: "current-session" };
    const staleScope = { accountId: "stale-account", sessionId: "stale-session" };
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(oldScope),
      "15f0558a-8e28-49e3-bc60-fbbc315a7f5d",
      undefined,
      1_000,
    );
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(currentScope),
      "7c056594-dc87-48aa-938d-7b4ba8de7f28",
      undefined,
      2_000,
    );
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(staleScope),
      "f3b66c8e-0cf1-4d92-8dcc-28e924789e4e",
      undefined,
      0,
    );
    storage.setItem("unrelated", "preserved");

    pruneCaptureIntents(storage, currentScope, 3_000);

    expect(storage.values.has(captureIntentStorageKey(oldScope))).toBe(false);
    expect(storage.values.has(captureIntentStorageKey(staleScope))).toBe(false);
    expect(loadCaptureIntent(storage, captureIntentStorageKey(currentScope), 3_000)).toBe(
      "7c056594-dc87-48aa-938d-7b4ba8de7f28",
    );
    expect(storage.getItem("unrelated")).toBe("preserved");
  });

  it("removes every capture identifier after confirmed disconnect", () => {
    const storage = fixtureStorage();
    const scope = { accountId: "account", sessionId: "session" };
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(scope),
      "15f0558a-8e28-49e3-bc60-fbbc315a7f5d",
      undefined,
      1_000,
    );

    pruneCaptureIntents(storage, null, 2_000);

    expect(storage.values.size).toBe(0);
  });

  it("sweeps only corrupt or expired scopes when native authority is stale", () => {
    const storage = fixtureStorage();
    const current = { accountId: "current", sessionId: "session" };
    const other = { accountId: "other", sessionId: "session" };
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(current),
      "15f0558a-8e28-49e3-bc60-fbbc315a7f5d",
      undefined,
      2_000,
    );
    saveCaptureIntent(
      storage,
      captureIntentStorageKey(other),
      "7c056594-dc87-48aa-938d-7b4ba8de7f28",
      undefined,
      1_000,
    );
    storage.setItem("ts.hybrid.capture.corrupt.scope", "not-json");

    sweepExpiredCaptureIntents(storage, 1_000 + 24 * 60 * 60 * 1000 + 1);

    expect(loadCaptureIntent(storage, captureIntentStorageKey(current), 3_000)).toBe(
      "15f0558a-8e28-49e3-bc60-fbbc315a7f5d",
    );
    expect(storage.values.has(captureIntentStorageKey(other))).toBe(false);
    expect(storage.values.has("ts.hybrid.capture.corrupt.scope")).toBe(false);
  });
});
