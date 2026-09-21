// @vitest-environment happy-dom
//
// Host-level regression for the conversation source dialog: opening it with
// dropped or pasted files must never upload on its own, a rapid double
// activation admits once, an unknown admission retries with the same
// idempotency key across close/reopen, the text tab and draft survive a
// reopen, and encoding that finishes after unmount must not POST old images
// under a new account scope.

import { act, createElement, StrictMode, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());

vi.mock("@/components/workspace-session-request", () => ({
  WORKSPACE_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  workspaceSessionFetch: fetcher,
  workspaceSessionExpired: () => false,
  relationshipIntegrationFetch: fetcher,
  relationshipIntegrationSessionExpired: () => false,
}));

import type { SourceDraftSnapshot } from "@/components/contact-agent/contact-agent-workspace";
import { ConversationSourceDialog } from "./conversation-source-dialog";
import {
  EMPTY_SOURCE_DRAFT,
  type SourceDraft,
} from "./conversation-source-draft";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

const TASK = {
  task_id: TASK_ID,
  status: "completed",
  revision: 1,
  created_at: "2026-09-21T08:00:00.000Z",
  summary: "",
  contact: null,
  source: {
    kind: "screenshot",
    title: "对话截图",
    url: "",
    time_basis: "imported_at",
  },
  source_text: "",
  source_captured_at: null,
  source_images: [{ image_index: 0 }],
  findings: [],
  profile_fields: [],
  public_sources: [],
  limitations: [],
  events: [],
  candidates: [],
  question: null,
  contact_draft: null,
  reviewed_profile: null,
  extraction: null,
  message_count: 0,
};

function image(name = "screenshot.png"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, {
    type: "image/png",
  });
}

function Harness({ initialFiles }: { initialFiles: File[] }) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<SourceDraft>({
    ...EMPTY_SOURCE_DRAFT,
    files: initialFiles,
  });
  const handleDraft = useCallback((snapshot: SourceDraftSnapshot) => {
    setDraft((previous) => ({
      ...previous,
      ...snapshot,
      // Mirror the real host: keep the saved task identity while the readback
      // GET is still in flight.
      taskID: snapshot.taskID ?? previous.taskID,
    }));
  }, []);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { id: "reopen", onClick: () => setOpen(true), type: "button" },
      "reopen",
    ),
    createElement(
      "button",
      { id: "hard-close", onClick: () => setOpen(false), type: "button" },
      "hard close",
    ),
    open
      ? createElement(ConversationSourceDialog, {
          initialError: null,
          initialFiles: draft.files,
          initialImageAttempt: draft.imageAttempt,
          initialInputMode: draft.inputMode,
          initialObjective: draft.objective,
          initialResearch: draft.research,
          initialTaskID: draft.taskID,
          initialText: draft.text,
          initialTextAttempt: draft.textAttempt,
          onDiscardDraft: () => setDraft(EMPTY_SOURCE_DRAFT),
          onDraftChange: handleDraft,
          onRequestClose: () => setOpen(false),
          open,
          returnFocusTo: null,
        })
      : null,
  );
}

let mount: HTMLDivElement | null = null;
let root: Root | null = null;

async function flush(times = 6): Promise<void> {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  );
}

function submit(): void {
  const primary = button("保存并整理");
  expect(primary).toBeDefined();
  primary?.click();
}

function postBodies(): unknown[] {
  return fetcher.mock.calls
    .filter((call) => {
      const [url, init] = call as [string, RequestInit | undefined];
      return (
        init?.method === "POST" &&
        String(url).endsWith("/api/contact-agent/tasks")
      );
    })
    .map((call) =>
      JSON.parse(String((call as [unknown, RequestInit])[1].body)),
    );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  fetcher.mockReset();
  fetcher.mockImplementation((url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.endsWith("/api/contact-agent/tasks")) {
      if (init?.method === "POST") {
        return Promise.resolve(Response.json(TASK, { status: 201 }));
      }
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(initialFiles: File[] = [image()], strict = false): Promise<void> {
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
  await act(async () => {
    const harness = createElement(Harness, { initialFiles });
    root?.render(strict ? createElement(StrictMode, null, harness) : harness);
  });
  await flush();
}

describe("conversation source dialog", () => {
  it("keeps seeded preview URLs live after Strict Mode effect replay", async () => {
    let sequence = 0;
    const revoked = new Set<string>();
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:preview-${++sequence}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => { revoked.add(url); });
    await render([image()], true);
    const preview = document.querySelector<HTMLImageElement>("img[alt='第 1 张截图预览']");
    expect(preview).not.toBeNull();
    expect(revoked.has(preview!.src)).toBe(false);
    expect(postBodies()).toHaveLength(0);
    await act(async () => root?.unmount());
    root = null;
    expect(revoked.has(preview!.src)).toBe(true);
  });

  it("shows thumbnails but never uploads on open", async () => {
    await render();
    expect(document.body.textContent).toContain("保存并整理图片");
    expect(document.body.textContent).toContain("不会作为对话消息发送");
    expect(
      document.querySelectorAll("ol[aria-label='待发送截图'] li"),
    ).toHaveLength(1);
    expect(postBodies()).toHaveLength(0);
  });

  it("admits once and blocks confirmation close actions throughout submission", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (
        target.endsWith("/api/contact-agent/tasks") &&
        init?.method === "POST"
      ) {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      if (target.endsWith("/api/contact-agent/tasks")) {
        return Promise.resolve(Response.json({ tasks: [] }));
      }
      return Promise.resolve(Response.json({}));
    });
    await render();
    await act(async () => {
      document.querySelector<HTMLButtonElement>("[aria-label='关闭来源整理']")?.click();
    });
    await flush(2);
    expect(button("保留并关闭")).toBeDefined();
    await act(async () => {
      submit();
      // Same-tick actions must respect the synchronous admission ref, before
      // React has committed disabled button attributes.
      button("保留并关闭")?.click();
      button("放弃草稿")?.click();
      submit();
    });
    await flush(3);
    expect(postBodies()).toHaveLength(1);
    expect(button("保留并关闭")?.disabled).toBe(true);
    expect(button("放弃草稿")?.disabled).toBe(true);
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    await act(async () => {
      resolvePost?.(Response.json(TASK, { status: 201 }));
    });
    await flush();
    expect(document.body.textContent).toContain("已整理");
  });

  it("reuses the exact uncertain intent across close and reopen", async () => {
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (
        target.endsWith("/api/contact-agent/tasks") &&
        init?.method === "POST"
      ) {
        return Promise.resolve(
          Response.json({ message: "暂时无法完成，请重试。" }, { status: 503 }),
        );
      }
      if (target.endsWith("/api/contact-agent/tasks")) {
        return Promise.resolve(Response.json({ tasks: [] }));
      }
      return Promise.resolve(Response.json({}));
    });
    await render();
    await act(async () => submit());
    await flush();
    expect(postBodies()).toHaveLength(1);
    expect(document.body.textContent).toContain("上一次提交的结果未确认");
    // Editing is locked while the intent is uncertain.
    const removeButtons = document.querySelectorAll(
      "button[aria-label^='移除第']",
    );
    expect((removeButtons[0] as HTMLButtonElement)?.disabled).toBe(true);

    // Close and keep the retained draft.
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>("button[aria-label='关闭来源整理']")
        ?.click();
    });
    await flush();
    expect(document.body.textContent).toContain("这次来源还没有保存");
    await act(async () => {
      button("保留并关闭")?.click();
    });
    await flush();
    expect(button("保存并整理")).toBeUndefined();

    // Reopen and retry: the same key and payload must be reused.
    await act(async () => {
      document.querySelector<HTMLButtonElement>("#reopen")?.click();
    });
    await flush();
    await act(async () => submit());
    await flush();
    const bodies = postBodies();
    expect(bodies).toHaveLength(2);
    expect((bodies[0] as { idempotency_key: string }).idempotency_key).toBe(
      (bodies[1] as { idempotency_key: string }).idempotency_key,
    );
    expect(JSON.stringify(bodies[1])).toBe(JSON.stringify(bodies[0]));
  });

  it("restores the text tab and its draft across a reopen", async () => {
    await render([]);
    await act(async () => button("文字")?.click());
    await flush();
    const textarea = document.querySelector<HTMLTextAreaElement>(
      "textarea[placeholder^='粘贴对话原文']",
    );
    expect(textarea).not.toBeNull();
    await act(async () => {
      if (!textarea) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "一段保留来源");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>("button[aria-label='关闭来源整理']")
        ?.click();
    });
    await flush();
    expect(document.body.textContent).not.toContain("这次来源还没有保存");

    await act(async () => {
      document.querySelector<HTMLButtonElement>("#reopen")?.click();
    });
    await flush();
    const restored = document.querySelector<HTMLTextAreaElement>(
      "textarea[placeholder^='粘贴对话原文']",
    );
    expect(restored?.value).toBe("一段保留来源");
    expect(button("文字")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reads the saved task back and reports a viewer error truthfully", async () => {
    await render();
    await act(async () => submit());
    await flush();
    expect(document.body.textContent).toContain("原始图片 · 1");
    const viewer = button("查看原图 1");
    expect(viewer).toBeDefined();

    fetcher.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes("/images/0")) {
        return Promise.resolve(
          Response.json({ message: "gone" }, { status: 503 }),
        );
      }
      if (target.endsWith("/api/contact-agent/tasks")) {
        return Promise.resolve(Response.json({ tasks: [] }));
      }
      return Promise.resolve(Response.json({}));
    });
    await act(async () => viewer?.click());
    await flush();
    expect(document.body.textContent).toContain("原图暂时无法读取");
  });

  it("restores the exact saved task readback on reopen", async () => {
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (
        target.endsWith("/api/contact-agent/tasks") &&
        init?.method === "POST"
      ) {
        return Promise.resolve(Response.json(TASK, { status: 201 }));
      }
      if (target.endsWith(`/api/contact-agent/tasks/${TASK_ID}`)) {
        return Promise.resolve(Response.json(TASK));
      }
      if (target.endsWith("/api/contact-agent/tasks")) {
        return Promise.resolve(Response.json({ tasks: [] }));
      }
      return Promise.resolve(Response.json({}));
    });
    await render();
    await act(async () => submit());
    await flush();
    expect(document.body.textContent).toContain("原始图片 · 1");

    await act(async () => {
      document
        .querySelector<HTMLButtonElement>("button[aria-label='关闭来源整理']")
        ?.click();
    });
    await flush();
    expect(button("保存并整理")).toBeUndefined();

    await act(async () => {
      document.querySelector<HTMLButtonElement>("#reopen")?.click();
    });
    await flush();
    expect(document.body.textContent).toContain("原始图片 · 1");
    expect(postBodies()).toHaveLength(1);
  });

  it("blocks a close that races the synchronous admission", async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    fetcher.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (
        target.endsWith("/api/contact-agent/tasks") &&
        init?.method === "POST"
      ) {
        return new Promise<Response>((resolve) => {
          resolvePost = resolve;
        });
      }
      if (target.endsWith("/api/contact-agent/tasks")) {
        return Promise.resolve(Response.json({ tasks: [] }));
      }
      return Promise.resolve(Response.json({}));
    });
    await render();
    await act(async () => {
      // Same tick: the admission signal must already govern the close.
      submit();
      document
        .querySelector<HTMLButtonElement>("button[aria-label='关闭来源整理']")
        ?.click();
    });
    await flush(3);
    expect(document.body.textContent).toContain("保存并整理图片");
    expect(document.body.textContent).not.toContain("这次来源还没有保存");
    await act(async () => {
      resolvePost?.(Response.json(TASK, { status: 201 }));
    });
    await flush();
    expect(postBodies()).toHaveLength(1);
  });

  it("never POSTs images whose encoding finished after unmount", async () => {
    let resolveDigest: ((buffer: ArrayBuffer) => void) | undefined;
    const digest = vi
      .spyOn(crypto.subtle, "digest")
      .mockImplementation(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveDigest = resolve;
          }),
      );
    await render();
    await act(async () => submit());
    await flush(2);
    await act(async () => {
      root?.unmount();
    });
    root = null;
    await act(async () => {
      resolveDigest?.(new Uint8Array([1, 2, 3, 4]).buffer);
      await Promise.resolve();
    });
    await flush();
    expect(digest).toHaveBeenCalled();
    expect(postBodies()).toHaveLength(0);
  });
});
