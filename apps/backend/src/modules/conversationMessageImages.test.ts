import { createHash } from "node:crypto";

import type { Pool } from "pg";

import { describe, expect, it, vi } from "vitest";

import {
  conversationImageManifestHash,
  readConversationRunImages,
  validateConversationImageUploads,
} from "./conversationMessageImages.js";

function pngBytes(fill = 1, size = 48): Buffer {
  const bytes = Buffer.alloc(size, fill);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  return bytes;
}

function upload(bytes: Buffer, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    attachment_id: "10000000-0000-4000-8000-00000000000a",
    file_name: "shot.png",
    media_type: "image/png" as const,
    byte_size: bytes.length,
    content_hash: createHash("sha256").update(bytes).digest("hex"),
    data_base64: bytes.toString("base64"),
    ...overrides,
  };
}

function failureCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

describe("conversation image admission validation", () => {
  it("returns the ordered metadata-only manifest for a valid batch", () => {
    const first = pngBytes(1);
    const second = pngBytes(2);
    const manifest = validateConversationImageUploads([
      upload(first),
      upload(second, { attachment_id: "10000000-0000-4000-8000-00000000000b", file_name: "second.png" }),
    ]);
    expect(manifest).toHaveLength(2);
    expect(manifest[0]).toMatchObject({ attachment_id: "10000000-0000-4000-8000-00000000000a", file_name: "shot.png", media_type: "image/png", byte_size: first.length });
    expect(manifest[1]?.file_name).toBe("second.png");
    expect(Object.keys(manifest[0]!)).not.toContain("data_base64");
  });

  it("rejects a hash mismatch and a non-canonical base64 payload", () => {
    const bytes = pngBytes();
    expect(failureCode(() => validateConversationImageUploads([upload(bytes, { content_hash: "a".repeat(64) })])))
      .toBe("CONTACT_IMAGE_INTEGRITY_MISMATCH");
    expect(failureCode(() => validateConversationImageUploads([upload(bytes, { data_base64: `${bytes.toString("base64")}\n` })])))
      .toBe("CONTACT_IMAGE_INTEGRITY_MISMATCH");
  });

  it("rejects bytes whose signature does not match the declared media type", () => {
    const bytes = pngBytes();
    expect(failureCode(() => validateConversationImageUploads([upload(bytes, { media_type: "image/jpeg" })])))
      .toBe("CONTACT_IMAGE_FORMAT_MISMATCH");
  });

  it("rejects a byte-size mismatch and a duplicate attachment id", () => {
    const bytes = pngBytes();
    expect(failureCode(() => validateConversationImageUploads([upload(bytes, { byte_size: bytes.length + 1 })])))
      .toBe("CONTACT_IMAGE_INTEGRITY_MISMATCH");
    expect(failureCode(() => validateConversationImageUploads([upload(bytes), upload(bytes)])))
      .toBe("CONVERSATION_IMAGE_DUPLICATE_ATTACHMENT");
  });

  it("rejects more than ten images and an over-budget total", () => {
    const bytes = pngBytes();
    expect(failureCode(() => validateConversationImageUploads(Array.from({ length: 11 }, (_, index) => upload(bytes, { attachment_id: `10000000-0000-4000-8000-0000000000${index.toString(16).padStart(2, "0")}` })))))
      .toBe("CONVERSATION_IMAGE_LIMIT");
    const large = pngBytes(7, 8_000_000);
    const ids = ["a", "b", "c", "d"].map((suffix) => `10000000-0000-4000-8000-00000000000${suffix}`);
    expect(failureCode(() => validateConversationImageUploads(ids.map((id) => upload(large, { attachment_id: id })))))
      .toBe("CONVERSATION_IMAGE_TOTAL_LIMIT");
  });
});

describe("conversation image manifest commitment", () => {
  it("pins the ordered manifest and changes with order or identity", () => {
    const base = validateConversationImageUploads([upload(pngBytes(1)), upload(pngBytes(2), { attachment_id: "10000000-0000-4000-8000-00000000000b" })]);
    const reordered = [base[1]!, base[0]!];
    expect(conversationImageManifestHash(base)).toMatch(/^[a-f0-9]{64}$/u);
    expect(conversationImageManifestHash(base)).toBe(conversationImageManifestHash([...base]));
    expect(conversationImageManifestHash(base)).not.toBe(conversationImageManifestHash(reordered));
    expect(conversationImageManifestHash(base)).not.toBe(conversationImageManifestHash([{ ...base[0]!, file_name: "renamed.png" }, base[1]!]));
  });
});


it("loads only the bounded selected bytes and preserves each message's image order", async () => {
  const rows = Array.from({ length: 24 }, (_, index) => ({
    queue_entry_id: `entry-${Math.floor(index / 2)}`,
    message_id: `message-${Math.floor(index / 2)}`,
    attachment_id: `attachment-${index}`,
    file_name: `${index}.png`, media_type: "image/png", byte_size: 4_000_000,
    content_hash: "a".repeat(64), sequence: String(12 - Math.floor(index / 2)), image_index: index % 2,
  }));
  const query = vi.fn().mockResolvedValueOnce({ rows }).mockImplementationOnce(async (_sql, args) => ({
    rows: args[2].map((id: string, index: number) => ({ queue_entry_id: id, image_index: args[3][index], content: Buffer.from([index]) })),
  }));
  const result = await readConversationRunImages({ query } as unknown as Pool, "account", "session", "entry-0");
  expect(query.mock.calls[0]![0]).not.toMatch(/i\.content[,\s]/u);
  expect(query.mock.calls[1]![1][2]).toHaveLength(7);
  expect(result.images.map((image) => image.manifest.file_name)).toEqual(["6.png", "4.png", "5.png", "2.png", "3.png", "0.png", "1.png"]);
  expect(result.images.map((image) => image.imageIndex)).toEqual([0, 0, 1, 0, 1, 0, 1]);
  expect(result.omitted).toBe(17);
});
