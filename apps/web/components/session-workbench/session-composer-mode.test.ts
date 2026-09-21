// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { SessionDetail } from "./session-detail-state";

const legacyChat = vi.hoisted(() => vi.fn(() => ({ ask: vi.fn() })));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../relationship-workspace/use-workspace-chat", () => ({ useWorkspaceChat: legacyChat }));
vi.mock("../conversation/queued-conversation", () => ({
  QueuedConversation: ({ initialDetail }: { initialDetail: SessionDetail }) => createElement("div", { "data-inline-chat": true }, initialDetail.turns[0]?.images?.[0]?.file_name),
}));
import { SessionWorkbench } from "./session-workbench";

const detail: SessionDetail = {
  session_id: "10000000-0000-4000-8000-000000000001", revision: 1,
  updated_at: "2026-09-21T00:00:00.000Z", expires_at: "2099-01-01T00:00:00.000Z",
  state: "active", title: "Synthetic image conversation", turn_count: 1,
  is_unread: false, scope_kind: "unresolved_intent", person_id: null,
  relationship_context_id: null, person_label: "", context_label: "", deleted_at: null,
  display_authority: "stale_unconfirmed", composer_draft: null, composer_draft_updated_at: null,
  turns: [{ id: "20000000-0000-4000-8000-000000000001", objective: "", createdAt: "2026-09-21T00:00:00.000Z",
    images: [{ attachment_id: "30000000-0000-4000-8000-000000000001", file_name: "synthetic.png", media_type: "image/png", byte_size: 10, content_hash: "a".repeat(64) }],
    response: { taskID: "synthetic", savedBlocks: [], createdAt: "2026-09-21T00:00:01.000Z", contractVersion: "1.0.0", contextManifestID: "synthetic", knowledgeSnapshotID: "synthetic", disposition: "answer" },
  }],
};
const props = { initialDetail: detail, accountId: "synthetic", chatSessionVersion: "chat", sessionVersion: "detail", storageScope: "synthetic", initialError: null, sessionRecoveryHref: null };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); legacyChat.mockClear(); });

it("never exposes the old send path during server rendering", () => {
  const html = renderToStaticMarkup(createElement(SessionWorkbench, props));
  expect(html).toContain("正在加载对话");
  expect(html).not.toContain("<textarea");
  expect(legacyChat).not.toHaveBeenCalled();
});

it("reopens image history into inline chat even when background animation frames never run", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const frame = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", frame);
  localStorage.clear();
  const mount = document.createElement("div");
  const root = createRoot(mount);
  try {
    await act(async () => { root.render(createElement(SessionWorkbench, props)); });
    expect(mount.querySelector("[data-inline-chat]")?.textContent).toBe("synthetic.png");
    expect(legacyChat).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
