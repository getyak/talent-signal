import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { bindChatMediaToManifest } from "./chatMedia.js";

const accountId = "10000000-0000-4000-8000-000000000001";
const personId = "20000000-0000-4000-8000-000000000001";
const contextId = "30000000-0000-4000-8000-000000000001";
const manifestId = "40000000-0000-4000-8000-000000000001";
const mediaId = "50000000-0000-4000-8000-000000000001";

function readyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: mediaId,
    subject_id: personId,
    assignment_id: contextId,
    created_by_user_id: "60000000-0000-4000-8000-000000000001",
    idempotency_key: "media-key",
    file_name: "context.jpg",
    media_type: "image/jpeg",
    byte_size: 4,
    width: null,
    height: null,
    storage_provider: "local",
    object_key: "account/person/media",
    status: "ready",
    created_at: new Date("2026-08-27T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Chat media manifest binding", () => {
  it("binds ready media in recruiter-selected order", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [readyRow()] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await bindChatMediaToManifest(
      { query } as unknown as PoolClient,
      accountId,
      personId,
      contextId,
      manifestId,
      [mediaId],
    );
    expect(result).toMatchObject([{ id: mediaId, status: "ready" }]);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO context_manifest_media"),
      [accountId, manifestId, mediaId, 0],
    );
  });

  it.each([
    ["wrong person", { subject_id: "70000000-0000-4000-8000-000000000001" }],
    ["wrong relationship", { assignment_id: "80000000-0000-4000-8000-000000000001" }],
    ["failed upload", { status: "failed" }],
  ])("rejects %s before creating a manifest binding", async (_label, override) => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [readyRow(override)] });
    await expect(
      bindChatMediaToManifest(
        { query } as unknown as PoolClient,
        accountId,
        personId,
        contextId,
        manifestId,
        [mediaId],
      ),
    ).rejects.toMatchObject({ code: "CHAT_MEDIA_NOT_READY", statusCode: 409 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
