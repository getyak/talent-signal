// @vitest-environment happy-dom
//
// Whole-surface regression: dropping an image on the ordinary conversation
// composer opens the real source dialog once, keeps the typed conversation
// draft and conversation position, and never uploads by itself. This is the
// regression that catches an unstable host draft callback looping the dialog.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/components/workspace-session-request", () => ({
  WORKSPACE_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  workspaceSessionFetch: fetcher,
  workspaceSessionExpired: () => false,
  relationshipIntegrationFetch: fetcher,
  relationshipIntegrationSessionExpired: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

import { QueuedConversation } from "./queued-conversation";

const SCOPE = "a".repeat(64);

let mount: HTMLDivElement | null = null;
let root: Root | null = null;

async function flush(times = 10): Promise<void> {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });
}

function dropEvent(file: File): Event {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types: ["Files"],
    },
  });
  return event;
}

function postCount(): number {
  return fetcher.mock.calls.filter((call) => {
    const [url, init] = call as [string, RequestInit | undefined];
    return (
      init?.method === "POST" &&
      String(url).includes("/api/contact-agent/tasks")
    );
  }).length;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  router.push.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  fetcher.mockReset();
  fetcher.mockImplementation((url: string) => {
    const target = String(url);
    if (target.endsWith("/api/contact-agent/tasks")) {
      return Promise.resolve(Response.json({ tasks: [] }));
    }
    return Promise.resolve(Response.json({}));
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  mount?.remove();
  mount = null;
  vi.unstubAllGlobals();
});

describe("conversation source intake", () => {
  it("preserves the draft and refuses new files while a saved outcome is unknown", async () => {
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    await act(async () => {
      root?.render(
        createElement(QueuedConversation, {
          chatBinding: "chat-binding",
          detailBinding: "detail-binding",
          scope: SCOPE,
        }),
      );
    });
    await flush();

    const composer = document.querySelector<HTMLTextAreaElement>(
      "#queued-conversation-composer",
    );
    expect(composer).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      if (!composer) return;
      setter?.call(composer, "保留的对话草稿");
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush(2);

    const file = new File([new Uint8Array([1, 2, 3])], "drop.png", {
      type: "image/png",
    });
    const target = document.querySelector<HTMLElement>("[data-variant]");
    expect(target).not.toBeNull();
    await act(async () => {
      target?.dispatchEvent(dropEvent(file));
    });
    await flush();
    await act(async () => {
      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("保存并整理图片");
        },
        { timeout: 5_000 },
      );
    });

    // The dialog mounted through next/dynamic and holds the dropped image.
    expect(document.body.textContent).toContain("保存并整理图片");
    expect(
      document.querySelectorAll("ol[aria-label='待发送截图'] li"),
    ).toHaveLength(1);
    // No remote submission happened on drop alone.
    expect(postCount()).toBe(0);
    // The conversation draft and its textarea are untouched behind the modal.
    expect(
      document.querySelector<HTMLTextAreaElement>(
        "#queued-conversation-composer",
      )?.value,
    ).toBe("保留的对话草稿");

    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(Response.json(
        init?.method === "POST" ? { message: "Unknown admission outcome" } : { tasks: [] },
        { status: init?.method === "POST" ? 503 : 200 },
      )),
    );
    const clickText = (text: string) => Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === text)?.click();
    await act(async () => clickText("保存并整理"));
    await flush();
    expect(postCount()).toBe(1);
    await act(async () => document.querySelector<HTMLButtonElement>("[aria-label='关闭来源整理']")?.click());
    await flush(2);
    await act(async () => clickText("保留并关闭"));
    await flush(2);
    const second = new File([new Uint8Array([4, 5, 6])], "second.png", { type: "image/png" });
    await act(async () => target?.dispatchEvent(dropEvent(second)));
    await flush();
    expect(document.body.textContent).toContain("请先重试或放弃原草稿");
    expect(document.querySelectorAll("ol[aria-label='待发送截图'] li")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("second.png");
    await act(async () => clickText("保存并整理"));
    await flush();
    const posts = fetcher.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === "POST");
    expect(posts).toHaveLength(2);
    expect((posts[1][1] as RequestInit).body).toBe((posts[0][1] as RequestInit).body);
  });
});
