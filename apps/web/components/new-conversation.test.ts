// @vitest-environment happy-dom
//
// Home + queue regression for the pre-queue conversation-home send record.
//
// The seeded records use the real `session-drafts` storage helpers and the real
// account partition key, so these tests exercise the exact bytes an old build
// left on this device. Nothing here mocks the legacy store.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("./workspace-session-request", () => ({
  RELATIONSHIP_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  WORKSPACE_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  relationshipIntegrationFetch: fetcher,
  relationshipIntegrationSessionExpired: () => false,
  workspaceSessionExpired: () => false,
  workspaceSessionFetch: fetcher,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

import { newConversationPendingDraft } from "@/lib/new-conversation";
import { WORKSPACE_NEW_CONVERSATION_EVENT } from "@/lib/workspace-navigation";
import { WorkspaceNewConversation } from "./new-conversation";
import {
  writePendingSessionDraft,
  type PendingSessionDraft,
} from "./session-workbench/session-draft-pending";

const SCOPE = "a".repeat(64);
const OTHER_SCOPE = "b".repeat(64);
const SESSION_ID = "72ce7ff4-a5a8-40d0-b1d7-d84a13adcd30";
const OTHER_SESSION_ID = "1b2c3d4e-5f60-4712-8a9b-0c1d2e3f4a5b";
const REQUEST_ID = "8f1c2f6e-9d24-4c9a-9d3d-2f6c1a5b7e10";
const OBJECTIVE = "旧版草稿  保留空格\n第二行";

type Props = {
  accountId: string | null;
  sessionBinding: string | null;
  sessionVersion: string | null;
  storageScope: string | null;
};
const READY: Props = {
  accountId: "account-1",
  sessionBinding: "session-binding",
  sessionVersion: "session-version",
  storageScope: SCOPE,
};

function draftKey(scope: string, sessionId: string): string {
  return `talent-signal:session-draft-pending:v1:${scope}:${sessionId}`;
}

function legacyRecord(options: {
  scope?: string;
  sessionId?: string;
  objective?: string;
  attempted?: boolean;
} = {}): PendingSessionDraft {
  const pending = newConversationPendingDraft({
    baseRevision: 1,
    intent: {
      requestId: REQUEST_ID,
      sessionId: options.sessionId ?? SESSION_ID,
      updatedAt: "2026-09-19T08:00:00.000Z",
    },
    objective: options.objective ?? OBJECTIVE,
    storageScope: options.scope ?? SCOPE,
  });
  return options.attempted === undefined
    ? pending
    : ({ ...pending, attempted: options.attempted } as PendingSessionDraft);
}

function seedLegacy(record: PendingSessionDraft): void {
  expect(writePendingSessionDraft(record)).toBe(true);
}

function setComposerValue(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
}

let mount: HTMLDivElement | null = null;
let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(props: Props = READY): Promise<void> {
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
  await act(async () => {
    root?.render(createElement(WorkspaceNewConversation, props));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  fetcher.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  router.replace.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  mount?.remove();
  mount = null;
  vi.unstubAllGlobals();
});

describe("authenticated home with a legacy conversation-home record", () => {
  it("keeps the old record recoverable and sends every new message through the durable queue", async () => {
    seedLegacy(legacyRecord({ attempted: true }));
    // Delayed network: the receipt never arrives during the assertions.
    fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    await render();
    await flush();

    // One composer, owned by the queue surface; never the legacy canvas.
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(document.querySelector("#queued-conversation-composer")).not.toBeNull();
    expect(document.querySelector("#new-conversation-objective")).toBeNull();
    expect(document.body.textContent).not.toContain("今天想推进什么？");

    // The old blocking send is never repeated, and its exact record is intact.
    expect(fetcher).not.toHaveBeenCalled();
    const stored = JSON.parse(
      localStorage.getItem(draftKey(SCOPE, SESSION_ID)) ?? "null",
    ) as PendingSessionDraft & { attempted?: boolean };
    expect(stored.latest.draft).toBe(OBJECTIVE);
    expect(stored.latest.idempotencyKey).toBe(REQUEST_ID);
    expect(stored.attempted).toBe(true);

    // The notice cannot enter the legacy controller, which would rebase the
    // uncertain home intent as a draft and lose the original retry identity.
    expect(
      document.querySelector(
        `a[href="/workspace/sessions/${SESSION_ID}"]`,
      ),
    ).toBeNull();
    expect(document.body.textContent).toContain("旧版消息");

    // Original whitespace is visible on demand, not truncated or normalized.
    const reveal = button("查看原文");
    expect(reveal).toBeDefined();
    await act(async () => reveal?.click());
    expect(document.querySelector("pre")?.textContent).toBe(OBJECTIVE);

    // A new send echoes immediately and releases the composer before receipt.
    const composer = document.querySelector<HTMLTextAreaElement>(
      "#queued-conversation-composer",
    );
    expect(composer).not.toBeNull();
    await act(async () => {
      if (composer) setComposerValue(composer, "全新的消息");
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="发送消息"]')
        ?.click();
    });
    await flush();

    expect(
      document.querySelector<HTMLTextAreaElement>(
        "#queued-conversation-composer",
      )?.value,
    ).toBe("");
    expect(document.body.textContent).toContain("全新的消息");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/conversation-queue$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.objective).toBe("全新的消息");
    expect(JSON.stringify(body)).not.toContain("旧版草稿");
    // Admission never converts, re-keys or clears the legacy record.
    expect(localStorage.getItem(draftKey(SCOPE, SESSION_ID))).not.toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["explicitly false", false],
  ] as const)(
    "treats a %s attempted flag as unknown and never submits it",
    async (_label, attempted) => {
      seedLegacy(legacyRecord({ attempted }));
      await render();
      await flush();

      expect(document.body.textContent).toContain("旧版消息");
      expect(document.body.textContent).toContain("是否已提交未知");
      expect(fetcher).not.toHaveBeenCalled();
      expect(localStorage.getItem(draftKey(SCOPE, SESSION_ID))).not.toBeNull();
    },
  );

  it("retains the same unresolved recovery across a home reset without duplicating it", async () => {
    seedLegacy(legacyRecord({ attempted: true }));
    await render();
    await flush();
    expect(
      document.querySelectorAll('[aria-label="旧版未完成消息"]'),
    ).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event(WORKSPACE_NEW_CONVERSATION_EVENT));
    });
    await flush();

    expect(
      document.querySelectorAll('[aria-label="旧版未完成消息"]'),
    ).toHaveLength(1);
    expect(document.body.textContent).toContain("旧版消息");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(draftKey(SCOPE, SESSION_ID)) ?? "null")
        .latest.draft,
    ).toBe(OBJECTIVE);
  });

  it("retains the same unresolved recovery across a fresh remount without duplicating it", async () => {
    seedLegacy(legacyRecord({ attempted: true }));
    await render();
    await flush();
    expect(
      document.querySelectorAll('[aria-label="旧版未完成消息"]'),
    ).toHaveLength(1);

    if (root) await act(async () => root?.unmount());
    root = null;
    mount?.remove();
    mount = null;

    await render();
    await flush();
    expect(
      document.querySelectorAll('[aria-label="旧版未完成消息"]'),
    ).toHaveLength(1);
    expect(document.body.textContent).toContain("旧版消息");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(draftKey(SCOPE, SESSION_ID)) ?? "null")
        .latest.draft,
    ).toBe(OBJECTIVE);
  });

  it("never surfaces another account partition's legacy record", async () => {
    seedLegacy(
      legacyRecord({ scope: OTHER_SCOPE, sessionId: OTHER_SESSION_ID }),
    );
    await render();
    await flush();

    expect(document.body.textContent).not.toContain("旧版消息");
    expect(document.body.textContent).not.toContain(OBJECTIVE);
    expect(
      document.querySelector('a[href*="/workspace/sessions/"]'),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops the recovery when another tab removes its exact record", async () => {
    seedLegacy(legacyRecord({ attempted: true }));
    await render();
    await flush();
    expect(document.body.textContent).toContain("旧版消息");

    localStorage.removeItem(draftKey(SCOPE, SESSION_ID));
    await act(async () => {
      const event = new Event("storage");
      Object.defineProperty(event, "key", {
        value: draftKey(SCOPE, SESSION_ID),
      });
      window.dispatchEvent(event);
    });
    await flush();

    expect(document.body.textContent).not.toContain("旧版消息");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops a record that is already expired at mount without claiming recovery", async () => {
    const expired = legacyRecord({ attempted: true });
    const savedAt = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();
    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    localStorage.setItem(
      draftKey(SCOPE, SESSION_ID),
      JSON.stringify({ ...expired, expiresAt, savedAt }),
    );

    await render();
    await flush();

    expect(document.body.textContent).not.toContain("旧版消息");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("drops the recovery at its own expiry without extending it", async () => {
    const record = legacyRecord({ attempted: true });
    seedLegacy({
      ...record,
      expiresAt: new Date(Date.now() + 1_000).toISOString(),
    } as PendingSessionDraft);

    await render();
    await flush();
    expect(document.body.textContent).toContain("旧版消息");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_400));
    });

    expect(document.body.textContent).not.toContain("旧版消息");
    expect(document.body.textContent).not.toContain(OBJECTIVE);
    expect(localStorage.getItem(draftKey(SCOPE, SESSION_ID))).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resets the queue surface across an account switch in the same root", async () => {
    const aHomeId = { value: "" };
    fetcher.mockImplementation((url, init) => {
      const target = String(url);
      const stream = target.match(
        /workspace-sessions\/([^/]+)\/conversation-queue\/stream$/,
      );
      if (stream) {
        const sessionId = stream[1];
        // A's live queue is observable; B's stream stays pending so any
        // carried-over A snapshot would stay visible if the surface were
        // reused instead of remounted.
        if (sessionId !== aHomeId.value) return new Promise<Response>(() => {});
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: snapshot\ndata: ${JSON.stringify({
                      session_id: sessionId,
                      revision: 1,
                      paused: false,
                      queued: [
                        {
                          queue_entry_id: "e1",
                          message_id: "m1",
                          objective: "A 的队列消息",
                          status: "queued",
                        },
                      ],
                      preview: null,
                      active: null,
                    })}\n\n`,
                  ),
                );
              },
            }),
          ),
        );
      }
      const queue = target.match(/workspace-sessions\/([^/]+)\/conversation-queue$/);
      if (queue && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.objective === "A 的发送中消息") aHomeId.value = queue[1];
        return Promise.resolve(Response.json({}, { status: 202 }));
      }
      return Promise.resolve(Response.json({}));
    });

    await render();
    await flush();
    const composer = document.querySelector<HTMLTextAreaElement>(
      "#queued-conversation-composer",
    );
    await act(async () => {
      if (composer) setComposerValue(composer, "A 的发送中消息");
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="发送消息"]')
        ?.click();
    });
    await flush();
    expect(document.body.textContent).toContain("A 的发送中消息");
    expect(document.body.textContent).toContain("A 的队列消息");
    const callsBeforeSwitch = fetcher.mock.calls.length;

    await act(async () => {
      root?.render(
        createElement(WorkspaceNewConversation, {
          accountId: "account-2",
          sessionBinding: "session-binding-b",
          sessionVersion: "session-version-b",
          storageScope: OTHER_SCOPE,
        }),
      );
    });
    await flush();

    expect(document.body.textContent).not.toContain("A 的发送中消息");
    expect(document.body.textContent).not.toContain("A 的队列消息");
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(
      document.querySelector<HTMLTextAreaElement>(
        "#queued-conversation-composer",
      )?.value,
    ).toBe("");

    const bComposer = document.querySelector<HTMLTextAreaElement>(
      "#queued-conversation-composer",
    );
    await act(async () => {
      if (bComposer) setComposerValue(bComposer, "B 的新消息");
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('button[aria-label="发送消息"]')
        ?.click();
    });
    await flush();

    const afterSwitch = fetcher.mock.calls.slice(callsBeforeSwitch);
    expect(
      afterSwitch.some((call) =>
        String(call[1]?.body ?? "").includes("A 的"),
      ),
    ).toBe(false);
    const bSend = afterSwitch.find(
      (call) =>
        call[1]?.method === "POST" &&
        String(call[0]).endsWith("/conversation-queue") &&
        String(call[1]?.body).includes("B 的新消息"),
    );
    expect(bSend).toBeDefined();
    expect(JSON.parse(String(bSend?.[1]?.body)).objective).toBe("B 的新消息");
  });

  it("renders the queue composer when local draft storage is inaccessible", async () => {
    const denied = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      await render();
      await flush();
      expect(
        document.querySelector("#queued-conversation-composer"),
      ).not.toBeNull();
      expect(document.body.textContent).not.toContain("旧版消息");
    } finally {
      denied.mockRestore();
    }
  });

  it("server-renders the queue surface for authenticated-ready props, not a live legacy controller", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceNewConversation, READY),
    );
    expect(html).toContain("queued-conversation-composer");
    expect(html).toContain("从一段对话，找到下一步。");
    expect(html).not.toContain("new-conversation-objective");
    expect(html).not.toContain("今天想推进什么？");
  });
});
