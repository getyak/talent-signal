// @vitest-environment happy-dom
//
// EXP-01 regression: the three create-contact resource POSTs (first source,
// confirmed identity clue, deferred identity) must each carry a stable request
// identity — request ID plus client-attested `captured_at` observation time —
// that survives same-intent retry after partial success and resets together
// when the intent changes. A retry after primary success / clue failure must
// reuse the same identities so the backend idempotency keys cannot create
// duplicate people or notes, and no request may ever omit `captured_at`.
// Also covers EXP-03's announced, focusable recoverable error that keeps the
// submitted content.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PersonDirectoryItem,
  ResourceCaptureResponse,
} from "@talent-signal/contracts";

const mock = vi.hoisted(() => ({
  committed: vi.fn(),
  deferred: vi.fn(),
  cancelled: vi.fn(),
}));
const fetcher = vi.hoisted(() => vi.fn());
vi.mock("@/components/workspace-session-request", () => ({
  WORKSPACE_SESSION_EXPIRED_EVENT: "talent-signal:workspace-session-expired",
  workspaceSessionFetch: fetcher,
  workspaceSessionExpired: () => false,
  relationshipIntegrationFetch: fetcher,
  relationshipIntegrationSessionExpired: () => false,
}));

import { AgentCreatePersonCard } from "./agent-create-person-card";

const NAME = "Synthetic Contact";
const CLUE = "synthetic.contact@example.org";
const CONTEXT = "Synthetic retained search";
const NOTE = "Recruiter-provided first source note.";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_CONTEXT_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_PERSON_ID = "55555555-5555-4555-8555-555555555555";

type ResourcePost = {
  request_id: string;
  captured_at: string;
  type: string;
  [key: string]: unknown;
};

let host: HTMLDivElement;
let root: Root;

function receipt(
  personId: string = PERSON_ID,
  extra: Partial<ResourceCaptureResponse["identity"]> = {},
): ResourceCaptureResponse {
  return {
    contract_version: "2026-08-24.10",
    identity: {
      status: "bound",
      person_id: personId,
      relationship_context_id: RELATIONSHIP_CONTEXT_ID,
      ...extra,
    },
    resource: { id: "66666666-6666-6666-8666-666666666666" },
  } as unknown as ResourceCaptureResponse;
}

function person(id: string, label: string): PersonDirectoryItem {
  return {
    id,
    display_label: label,
    context_count: 1,
    capture_count: 1,
    confirmed_identity_count: 0,
    last_activity_at: "2026-09-20T00:00:00.000Z",
    profile: null,
    avatar: null,
    contexts: [
      {
        id: RELATIONSHIP_CONTEXT_ID,
        display_label: CONTEXT,
        last_activity_at: "2026-09-20T00:00:00.000Z",
      },
    ],
    identity_matches: [{ kind: "name" }],
  };
}

function resourcePosts(): ResourcePost[] {
  return fetcher.mock.calls
    .filter((call) =>
      String(call[0]).endsWith("/api/local-integration/resources"),
    )
    .map((call) =>
      JSON.parse(String((call[1] as RequestInit | undefined)?.body)),
    );
}

async function flush(ms = 320) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function type(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  );
  expect(field).toBeTruthy();
  const target = field!;
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
    target,
    value,
  );
  await act(async () => {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickButton(text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}

async function toggleConfirmClue() {
  await setConfirmClue(true);
}

async function setConfirmClue(checked: boolean) {
  const checkbox = host.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(checkbox).toBeTruthy();
  if (checkbox!.checked !== checked) {
    await act(async () => {
      checkbox!.click();
      checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  expect(checkbox!.checked).toBe(checked);
}

async function clickPrimary() {
  const button = host.querySelector<HTMLButtonElement>(
    "button.context-primary-button",
  );
  expect(button).toBeTruthy();
  expect(button!.disabled).toBe(false);
  await act(async () => button!.click());
}

async function fillCreateDraft() {
  await type('input[placeholder="例如：陈雅宁"]', NAME);
  await type('input[placeholder="邮箱、电话、LinkedIn 网址或 wechat:ID"]', CLUE);
  await type('input[placeholder="例如：产品副总裁寻访"]', CONTEXT);
  await type(
    'textarea[placeholder="粘贴由你提供、可说明为何创建此关系的备注。"]',
    NOTE,
  );
  await flush();
}

async function render() {
  await act(async () => {
    root.render(
      createElement(AgentCreatePersonCard, {
        onCancel: mock.cancelled,
        onCommitted: mock.committed,
        onDeferred: mock.deferred,
      }),
    );
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetcher.mockImplementation((url: string) => {
    if (String(url).includes("/people/search")) {
      return Promise.resolve(Response.json({ people: [] }));
    }
    return Promise.resolve(Response.json({ receipts: [receipt()] }));
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("create-contact resource request identity", () => {
  it("binds a captured_at observation time to the first source and the confirmed clue", async () => {
    await render();
    await fillCreateDraft();
    await toggleConfirmClue();
    await clickButton("创建新人物");
    await flush(50);

    const posts = resourcePosts();
    expect(posts).toHaveLength(2);
    const [source, clue] = posts;
    for (const post of posts) {
      // A real, canonical ISO observation time, never missing or invented.
      expect(post.captured_at).toBeTruthy();
      expect(new Date(post.captured_at).toISOString()).toBe(post.captured_at);
      expect(post.request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
    // Each request identity carries its own observation time.
    expect(source.request_id).not.toBe(clue.request_id);
    expect(source.type).toBe("note");
    expect(source.scope_mode).toBe("new_person");
    expect(source.value).toBe(NOTE);
    expect(clue.type).toBe("contact");
    expect(clue.identity_clue_confirmed).toBe(true);
    expect(clue.person_id).toBe(PERSON_ID);
    expect(clue.relationship_context_id).toBe(RELATIONSHIP_CONTEXT_ID);
    expect(mock.committed).toHaveBeenCalledWith(
      expect.objectContaining({
        person: expect.objectContaining({ id: PERSON_ID }),
      }),
      expect.any(Array),
      "created_person",
    );
  });

  it("keeps the clue request identity on same-intent retry and never rewrites the saved first source", async () => {
    let resourceCall = 0;
    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        return Promise.resolve(Response.json({ people: [] }));
      }
      resourceCall += 1;
      if (resourceCall === 2) {
        return Promise.resolve(
          Response.json({ message: "clue rejected" }, { status: 422 }),
        );
      }
      return Promise.resolve(Response.json({ receipts: [receipt()] }));
    });
    await render();
    await fillCreateDraft();
    await toggleConfirmClue();
    await clickPrimary();
    await flush(50);

    // Partial success: the note committed, the clue failed. The error is an
    // announced, focusable recovery message and the draft is untouched.
    const error = host.querySelector<HTMLParagraphElement>(
      ".context-agent-create__error",
    );
    expect(error).toBeTruthy();
    expect(error!.getAttribute("role")).toBe("alert");
    expect(error!.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(error);
    expect(
      host.querySelector<HTMLInputElement>('input[placeholder="例如：陈雅宁"]')!
        .value,
    ).toBe(NAME);
    expect(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="粘贴由你提供、可说明为何创建此关系的备注。"]',
      )!.value,
    ).toBe(NOTE);
    expect(mock.committed).not.toHaveBeenCalled();

    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        return Promise.resolve(Response.json({ people: [] }));
      }
      return Promise.resolve(Response.json({ receipts: [receipt()] }));
    });
    await clickPrimary();
    await flush(50);

    const posts = resourcePosts();
    // The same-intent retry writes only the missing clue. The saved first
    // source is never posted again under any identity, so no retry can
    // duplicate a person or note.
    expect(posts).toHaveLength(3);
    expect(posts.filter((post) => post.type === "note")).toHaveLength(1);
    const contacts = posts.filter((post) => post.type === "contact");
    expect(contacts).toHaveLength(2);
    // The retried clue keeps its exact request identity and observation time,
    // so the backend idempotency key replays instead of writing twice.
    expect(contacts[1].request_id).toBe(contacts[0].request_id);
    expect(contacts[1].captured_at).toBe(contacts[0].captured_at);
    expect(mock.committed).toHaveBeenCalledTimes(1);
  });

  it("resets request ID and observation time together when the intent changes", async () => {
    let fail = true;
    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        return Promise.resolve(Response.json({ people: [] }));
      }
      if (fail) {
        return Promise.resolve(
          Response.json({ message: "source rejected" }, { status: 422 }),
        );
      }
      return Promise.resolve(Response.json({ receipts: [receipt()] }));
    });
    await render();
    await fillCreateDraft();
    await clickButton("创建新人物");
    await flush(50);
    expect(
      host.querySelector(".context-agent-create__error"),
    ).toBeTruthy();

    // The recruiter edits the note: a changed intent gets a fresh identity and
    // a fresh observation time (never a reused or invented one).
    await type(
      'textarea[placeholder="粘贴由你提供、可说明为何创建此关系的备注。"]',
      `${NOTE} Edited.`,
    );
    await flush(30);
    fail = false;
    await clickButton("创建新人物");
    await flush(50);

    const posts = resourcePosts();
    expect(posts).toHaveLength(2);
    expect(posts[1].request_id).not.toBe(posts[0].request_id);
    expect(posts[1].captured_at).not.toBe(posts[0].captured_at);
    expect(new Date(posts[1].captured_at).toISOString()).toBe(
      posts[1].captured_at,
    );
    expect(mock.committed).toHaveBeenCalledTimes(1);
  });

  it("saves an ambiguous identity for review with its own stable request identity", async () => {
    let fail = true;
    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        return Promise.resolve(
          Response.json({
            people: [
              person(PERSON_ID, "Synthetic Person One"),
              person(OTHER_PERSON_ID, "Synthetic Person Two"),
            ],
          }),
        );
      }
      if (fail) {
        return Promise.resolve(
          Response.json({ message: "defer rejected" }, { status: 422 }),
        );
      }
      return Promise.resolve(
        Response.json({
          receipts: [receipt(PERSON_ID, { resolution_case_id: CASE_ID })],
        }),
      );
    });
    await render();
    await type('input[placeholder="例如：陈雅宁"]', NAME);
    await type('input[placeholder="例如：产品副总裁寻访"]', CONTEXT);
    await type(
      'textarea[placeholder="粘贴由你提供、可说明为何创建此关系的备注。"]',
      NOTE,
    );
    await flush();

    await clickButton("保存待身份审阅");
    await flush(50);
    expect(
      host.querySelector(".context-agent-create__error"),
    ).toBeTruthy();
    expect(mock.deferred).not.toHaveBeenCalled();

    fail = false;
    await clickButton("保存待身份审阅");
    await flush(50);

    const posts = resourcePosts();
    expect(posts).toHaveLength(2);
    const [first, second] = posts;
    expect(first.captured_at).toBeTruthy();
    expect(new Date(first.captured_at).toISOString()).toBe(first.captured_at);
    expect(first.scope_mode).toBe("identity_candidates");
    expect(first.candidate_person_ids).toEqual([
      PERSON_ID,
      OTHER_PERSON_ID,
    ]);
    expect(first.title).toBe("你提供的、等待确认身份的来源");
    // Same-intent retry after failure keeps the identity and observation time.
    expect(second.request_id).toBe(first.request_id);
    expect(second.captured_at).toBe(first.captured_at);
    expect(mock.deferred).toHaveBeenCalledWith(CASE_ID);
    expect(mock.committed).not.toHaveBeenCalled();
  });
});

describe("partial-success clue recovery", () => {
  const CLUE_2 = "corrected.clue@example.org";

  it("retries only the corrected clue against the saved person and never writes a second source", async () => {
    let resourceCall = 0;
    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        // After the clue correction a fresh directory search surfaces another
        // person; the committed person must not be silently retargeted.
        return Promise.resolve(
          resourceCall >= 2
            ? Response.json({ people: [person(OTHER_PERSON_ID, "Synthetic Person Two")] })
            : Response.json({ people: [] }),
        );
      }
      resourceCall += 1;
      if (resourceCall === 2) {
        return Promise.resolve(
          Response.json({ message: "clue rejected" }, { status: 422 }),
        );
      }
      // A hypothetical second first-source write would surface a different
      // person; any such write is exactly the regression under test.
      return Promise.resolve(
        Response.json({
          receipts: [
            receipt(resourceCall === 1 ? PERSON_ID : OTHER_PERSON_ID),
          ],
        }),
      );
    });
    await render();
    await fillCreateDraft();
    await toggleConfirmClue();
    await clickPrimary();
    await flush(50);

    // Partial success: first source/person saved, clue rejected. The message
    // asks the recruiter to review the clue and retry.
    const error = host.querySelector<HTMLParagraphElement>(
      ".context-agent-create__error",
    );
    expect(error).toBeTruthy();
    expect(error!.textContent).toContain("关系来源已保存");

    // Committed source and scope are frozen; the clue stays editable.
    expect(
      host.querySelector<HTMLInputElement>(
        'input[placeholder="例如：陈雅宁"]',
      )!.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>(
        'input[placeholder="例如：产品副总裁寻访"]',
      )!.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="粘贴由你提供、可说明为何创建此关系的备注。"]',
      )!.disabled,
    ).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>(
        'input[placeholder="邮箱、电话、LinkedIn 网址或 wechat:ID"]',
      )!.disabled,
    ).toBe(false);

    // The instructed correction: edit the clue, confirm, retry.
    await type(
      'input[placeholder="邮箱、电话、LinkedIn 网址或 wechat:ID"]',
      CLUE_2,
    );
    await flush();
    await setConfirmClue(true);
    await clickPrimary();
    await flush(50);

    const posts = resourcePosts();
    // Exactly one first-source / new_person write, ever.
    expect(
      posts.filter(
        (post) => post.type === "note" || post.scope_mode === "new_person",
      ),
    ).toHaveLength(1);
    expect(posts).toHaveLength(3);
    const contacts = posts.filter((post) => post.type === "contact");
    expect(contacts).toHaveLength(2);
    for (const contact of contacts) {
      // Every clue write binds the same saved person and relationship
      // context, never a person invented by a later search.
      expect(contact.person_id).toBe(PERSON_ID);
      expect(contact.relationship_context_id).toBe(
        RELATIONSHIP_CONTEXT_ID,
      );
      expect(contact.identity_clue_confirmed).toBe(true);
    }
    expect(contacts[1].value).toBe(CLUE_2);
    expect(mock.committed).toHaveBeenCalledTimes(1);
    expect(mock.committed).toHaveBeenCalledWith(
      expect.objectContaining({
        person: expect.objectContaining({
          id: PERSON_ID,
          display_label: NAME,
        }),
        relationship_context: expect.objectContaining({
          id: RELATIONSHIP_CONTEXT_ID,
          display_label: CONTEXT,
        }),
      }),
      expect.any(Array),
      "created_person",
    );
  });

  it("completes the saved person without another source write when the clue is omitted", async () => {
    let resourceCall = 0;
    fetcher.mockImplementation((url: string) => {
      if (String(url).includes("/people/search")) {
        return Promise.resolve(Response.json({ people: [] }));
      }
      resourceCall += 1;
      if (resourceCall === 2) {
        return Promise.resolve(
          Response.json({ message: "clue rejected" }, { status: 422 }),
        );
      }
      return Promise.resolve(Response.json({ receipts: [receipt()] }));
    });
    await render();
    await fillCreateDraft();
    await toggleConfirmClue();
    await clickPrimary();
    await flush(50);
    expect(
      host.querySelector(".context-agent-create__error"),
    ).toBeTruthy();

    // Omission path: the recruiter withdraws the unsaved clue and completes.
    await setConfirmClue(false);
    await clickPrimary();
    await flush(50);

    // No further resource write of any kind.
    expect(resourcePosts()).toHaveLength(2);
    expect(mock.committed).toHaveBeenCalledTimes(1);
    const call = mock.committed.mock.calls[0] as unknown as [
      { person: { id: string } },
      unknown[],
      string,
    ];
    expect(call[0].person.id).toBe(PERSON_ID);
    expect(call[1]).toHaveLength(1);
    expect(call[2]).toBe("created_person");
  });
});
