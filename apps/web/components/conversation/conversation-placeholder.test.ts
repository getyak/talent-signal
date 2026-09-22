// @vitest-environment happy-dom
//
// The redundant visible "（图片）" placeholder is removed for an image-only
// message in every render state (sent, active, local outbox, queue) because the
// shared `displayText` helper feeds all of them. The image strip itself must
// still expose accessible alt text and explicit error/retry recovery.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../workspace-session-request", () => ({
  WORKSPACE_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  workspaceSessionFetch: vi.fn(),
  workspaceSessionExpired: () => false,
  relationshipIntegrationFetch: vi.fn(),
  relationshipIntegrationSessionExpired: () => false,
}));

import { setConversationImageStoreForTest, type ConversationImageStore } from "@/lib/conversation-image-store";
import { ConversationImageStrip } from "./conversation-images";
import { displayText } from "./queued-conversation";

const manifest = {
  attachment_id: "11111111-1111-4111-8111-111111111111",
  file_name: "synthetic-screenshot.png",
  media_type: "image/png" as const,
  byte_size: 8,
  content_hash: "a".repeat(64),
};

async function flush(times = 8): Promise<void> {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });
}

describe("image-only message text", () => {
  it("suppresses the redundant placeholder only when an image attachment exists", () => {
    expect(displayText("", [manifest])).toBe("");
    expect(displayText("   ", [manifest])).toBe("");
    expect(displayText("看这张截图", [manifest])).toBe("看这张截图");
    expect(displayText("看这张截图", undefined)).toBe("看这张截图");
    // An empty objective with no attachment stays unchanged (already empty).
    expect(displayText("", undefined)).toBe("");
  });
});

describe("inline image strip accessibility and recovery", () => {
  let mount: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    mount?.remove();
    mount = null;
    setConversationImageStoreForTest(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function storeWith(records: Array<{ attachment_id: string; position: number; blob: Blob }> | []): ConversationImageStore {
    return {
      async put() { return true; },
      async get() {
        return records.map((record) => ({ ...manifest, ...record, expiresAt: Date.now() + 60_000 }));
      },
      async delete() {},
      async deletePrefix() {},
      async inventory() { return []; },
    };
  }

  async function renderStrip(): Promise<void> {
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    await act(async () => {
      root?.render(createElement(ConversationImageStrip, {
        binding: "chat-binding",
        images: [manifest],
        local: true,
        messageId: "22222222-2222-4222-8222-222222222222",
        scope: "a".repeat(64),
        sessionId: "33333333-3333-4333-8333-333333333333",
      }));
    });
    await flush();
  }

  it("keeps the image accessible alt text and group label", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    setConversationImageStoreForTest(storeWith([
      { attachment_id: manifest.attachment_id, position: 0, blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
    ]));
    await renderStrip();
    expect(document.querySelector("[aria-label='消息中的 1 张图片']")).not.toBeNull();
    expect(document.querySelector("img[alt='synthetic-screenshot.png']")).not.toBeNull();
    expect(document.body.textContent).not.toContain("（图片）");
  });

  it("keeps an explicit unreadable-image state and retry recovery", async () => {
    setConversationImageStoreForTest(storeWith([]));
    await renderStrip();
    expect(document.body.textContent).toContain("图片暂时无法读取");
    expect(document.body.textContent).toContain("重新读取图片");
  });
});
