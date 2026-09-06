import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocalChatMediaStorage,
  S3ChatMediaStorage,
} from "./chatMediaStorage.js";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("S3 Chat media storage", () => {
  it("writes private bytes to the configured bucket and object key", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValue({} as never);
    const storage = new S3ChatMediaStorage("private-chat-media", {
      endpoint: "https://s3.example.test",
      forcePathStyle: true,
      region: "test-1",
    });
    await storage.put(
      "account/person/media",
      new Uint8Array([1, 2, 3]),
      "image/webp",
    );
    const command = send.mock.calls[0]?.[0] as unknown as {
      input: Record<string, unknown>;
    };
    expect(command.input).toMatchObject({
      Bucket: "private-chat-media",
      Key: "account/person/media",
      ContentLength: 3,
      ContentType: "image/webp",
      ServerSideEncryption: "AES256",
    });
  });

  it("purges every exact-key version without deleting a prefix sibling", async () => {
    const responses = [
      { Versions: [{ Key: "account/person/media", VersionId: "v2" }, { Key: "account/person/media-copy", VersionId: "other" }],
        DeleteMarkers: [{ Key: "account/person/media", VersionId: "v1" }] },
      {},
      { Versions: [], DeleteMarkers: [] },
    ];
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async () => responses.shift() as never);
    const storage = new S3ChatMediaStorage("private-chat-media", {
      endpoint: "https://s3.example.test", forcePathStyle: true, region: "test-1",
    });
    await storage.purgeForLab("account/person/media");
    const deletion = send.mock.calls[1]?.[0] as unknown as {input:{Delete:{Objects:Array<{Key:string;VersionId:string}>}}};
    expect(deletion.input.Delete.Objects).toEqual([
      { Key: "account/person/media", VersionId: "v2" },
      { Key: "account/person/media", VersionId: "v1" },
    ]);
  });
});

describe("local Chat media storage", () => {
  it("round-trips private bytes and deletes the object", async () => {
    const directory = await mkdtemp(join(tmpdir(), "talent-signal-chat-media-"));
    directories.push(directory);
    const storage = new LocalChatMediaStorage(directory);
    const body = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

    await storage.put("account/person/media", body, "image/jpeg");
    const stored = await storage.get("account/person/media", "image/jpeg");
    expect(Array.from(stored.body)).toEqual(Array.from(body));
    expect(stored.contentType).toBe("image/jpeg");
    await storage.delete("account/person/media");
    expect(await storage.existsForLab("account/person/media")).toBe(false);
    await expect(storage.get("account/person/media", "image/jpeg")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects object keys that escape the configured root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "talent-signal-chat-media-"));
    directories.push(directory);
    const storage = new LocalChatMediaStorage(directory);
    await expect(storage.put("../../escape", new Uint8Array([1]), "image/png")).rejects.toThrow(
      "escaped its configured directory",
    );
  });
});
