// @vitest-environment happy-dom
//
// Bounded outbox image retention: expiry, orphan pruning after a crash between
// the durable put and the localStorage commit, and logout invalidation that
// removes a late in-flight write.
import { afterEach, expect, it, vi } from "vitest";

import type { ConversationImageManifest } from "@talent-signal/contracts";
import {
  invalidateConversationImageStore,
  persistConversationImages,
  purgeExpiredConversationImages,
  pruneConversationImages,
  removeConversationImages,
  setConversationImageStoreForTest,
  type ConversationImageStore,
  type DurableConversationImage,
} from "./conversation-image-store";
import {
  listConversationImageKeys,
  writeConversationMessage,
  type LocalMessage,
} from "./conversation-local";

type Target = Pick<Storage, "length" | "key" | "getItem" | "removeItem" | "setItem">;

function memoryTarget(): Target {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

function memoryStore() {
  const map = new Map<string, DurableConversationImage[]>();
  const store: ConversationImageStore = {
    async put(key, images) { map.set(key, [...images]); return true; },
    async get(key) { return map.get(key) ?? []; },
    async delete(key) { map.delete(key); },
    async deletePrefix(prefix) { for (const key of [...map.keys()]) if (key.startsWith(prefix)) map.delete(key); },
    async inventory() {
      return [...map.entries()].map(([key, images]) => ({
        key,
        expiresAt: images.reduce((min, image) => Math.min(min, image.expiresAt), Number.POSITIVE_INFINITY),
      }));
    },
  };
  return { map, store };
}

const manifest: ConversationImageManifest = {
  attachment_id: "10000000-0000-4000-8000-000000000001",
  file_name: "shot.png",
  media_type: "image/png",
  byte_size: 4,
  content_hash: "a".repeat(64),
};

function record(expiresAt: number): DurableConversationImage {
  return { ...manifest, position: 0, blob: new Blob([new Uint8Array([1, 2, 3, 4])]), expiresAt };
}
function message(id: string, expiresAt: number): LocalMessage {
  return { id, objective: "", images: [manifest], createdAt: new Date().toISOString(), delivery: "pending", expiresAt };
}
const scope = "owner";
const session = "72ce7ff4-a5a8-40d0-b1d7-d84a13adcd30";

afterEach(() => {
  setConversationImageStoreForTest(undefined);
  vi.unstubAllGlobals();
});

it("purges expired records and keeps live ones", async () => {
  const { map, store } = memoryStore();
  setConversationImageStoreForTest(store);
  await persistConversationImages(scope, session, "a", [record(Date.now() + 60_000)]);
  await persistConversationImages(scope, session, "b", [record(Date.now() - 1)]);
  await purgeExpiredConversationImages();
  expect(map.has(`${scope}:${session}:a`)).toBe(true);
  expect(map.has(`${scope}:${session}:b`)).toBe(false);
});

it("lists only live outbox image keys and prunes crash orphans", async () => {
  const { map, store } = memoryStore();
  setConversationImageStoreForTest(store);
  const target = memoryTarget();
  const live = "10000000-0000-4000-8000-0000000000aa";
  writeConversationMessage(scope, session, message(live, Date.now() + 60_000), target as Storage);
  await persistConversationImages(scope, session, live, [record(Date.now() + 60_000)]);
  await persistConversationImages(scope, session, "10000000-0000-4000-8000-0000000000bb", [record(Date.now() + 60_000)]);
  expect(listConversationImageKeys(scope, target as Storage)).toEqual([`${scope}:${session}:${live}`]);
  await pruneConversationImages(new Set(listConversationImageKeys(scope, target as Storage)), `${scope}:`);
  expect(map.has(`${scope}:${session}:${live}`)).toBe(true);
  expect(map.has(`${scope}:${session}:10000000-0000-4000-8000-0000000000bb`)).toBe(false);
});

it("removes a late in-flight put after logout invalidation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { map, store } = memoryStore();
  setConversationImageStoreForTest({
    ...store,
    put: async (key, images) => { await gate; return store.put(key, images); },
  });
  const pending = persistConversationImages(scope, session, "late", [record(Date.now() + 60_000)]);
  invalidateConversationImageStore();
  release();
  await expect(pending).resolves.toBe(false);
  expect(map.has(`${scope}:${session}:late`)).toBe(false);
});

it("removes a rejected message's bytes by explicit key", async () => {
  const { map, store } = memoryStore();
  setConversationImageStoreForTest(store);
  await persistConversationImages(scope, session, "rejected", [record(Date.now() + 60_000)]);
  await removeConversationImages(scope, session, "rejected");
  expect(map.size).toBe(0);
});

it("account switching removes old blobs and fences late puts even without localStorage", async () => {
  const { sweepConversationImageStore, clearConversationImageStore } = await import("./conversation-image-lifecycle");
  const { map, store } = memoryStore();
  setConversationImageStoreForTest(store);
  sweepConversationImageStore("old-owner");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await persistConversationImages("old-owner", session, "old", [record(Date.now() + 60_000)]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  setConversationImageStoreForTest({ ...store, put: async (key, images) => { await gate; return store.put(key, images); } });
  const pending = persistConversationImages("old-owner", session, "late", [record(Date.now() + 60_000)]);
  sweepConversationImageStore("new-owner");
  release();
  await expect(pending).resolves.toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(map.size).toBe(0);
  setConversationImageStoreForTest(store);
  await persistConversationImages("new-owner", session, "not-yet-in-localStorage", [record(Date.now() + 60_000)]);
  sweepConversationImageStore("new-owner");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(map.size).toBe(1);
  clearConversationImageStore();
});


it("logout clears IndexedDB while localStorage access is denied", async () => {
  const { clearAllPendingSessionDrafts } = await import("../components/session-workbench/session-draft-pending");
  const { map, store } = memoryStore();
  setConversationImageStoreForTest(store);
  await persistConversationImages(scope, session, "logout", [record(Date.now() + 60_000)]);
  clearAllPendingSessionDrafts(null);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(map.size).toBe(0);
});
