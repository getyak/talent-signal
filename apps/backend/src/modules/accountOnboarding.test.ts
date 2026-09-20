import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import type { AuthContext } from "./auth.js";
import {
  isSafePublicProfileUrl,
  mutateAccountOnboarding,
  previewAccountOnboardingProfile,
  readAccountOnboarding,
} from "./accountOnboarding.js";
import { previewPublicProfilePage } from "./research.js";

const auth: AuthContext = {
  accountId: "10000000-0000-4000-8000-000000000001",
  accountSlug: "personal-test",
  sessionId: "20000000-0000-4000-8000-000000000001",
  userEmail: "ada@example.test",
  userId: "30000000-0000-4000-8000-000000000001",
  userKind: "password_human",
};

function fakePool(options: { kind?: string; status?: "active" | "revoked" } = {}) {
  const state = {
    user: {
      id: auth.userId,
      kind: options.kind ?? "password_human",
      status: options.status ?? "active",
      display_name: "Ada",
      onboarding_focus: "",
      onboarding_profile_url: "",
      onboarding_status: "pending" as "pending" | "completed" | "skipped",
      profile_revision: 1,
    },
    events: new Map<string, string>(),
    queries: [] as Array<[string, unknown[]]>,
  };
  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    state.queries.push([sql, parameters]);
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM accounts WHERE id")) {
      return { rows: [{ id: auth.accountId }], rowCount: 1 };
    }
    if (sql.includes("FROM sessions")) {
      return { rows: [{ id: auth.sessionId }], rowCount: 1 };
    }
    if (sql.includes("FROM account_access_events")) {
      const hash = state.events.get(String(parameters[2]));
      return hash
        ? { rows: [{ request_hash: hash }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.startsWith("UPDATE users")) {
      state.user = {
        ...state.user,
        display_name: String(parameters[2]),
        onboarding_focus: String(parameters[3]),
        onboarding_profile_url: String(parameters[4]),
        onboarding_status: parameters[5] as "completed" | "skipped",
        profile_revision: state.user.profile_revision + 1,
      };
      return { rows: [state.user], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO account_access_events")) {
      state.events.set(String(parameters[0]), String(parameters[3]));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM users")) {
      return { rows: [state.user], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    pool: { connect: async () => client } as unknown as Pool,
    state,
    client,
  };
}

const mutationId = "40000000-0000-4000-8000-000000000001";
const mutation = {
  id: mutationId,
  expected_revision: 1,
  display_name: "Ada Lovelace",
  focus: "Staff backend roles in Europe",
  profile_url: "https://example.test/ada",
  status: "completed" as const,
};

describe("profile URL safety", () => {
  it("accepts empty and public HTTPS URLs", () => {
    expect(isSafePublicProfileUrl("")).toBe(true);
    expect(isSafePublicProfileUrl("https://example.test/ada")).toBe(true);
  });

  it.each([
    "http://example.test/ada",
    "https://user:pass@example.test/ada",
    "https://127.0.0.1/ada",
    "https://[::1]/ada",
    "https://localhost/ada",
    "https://192.168.1.5/ada",
    "https://printer.local/ada",
    "https://internal/ada",
    "not a url",
  ])("rejects unsafe URL %s", (value) => {
    expect(isSafePublicProfileUrl(value)).toBe(false);
  });
});

describe("current-user onboarding state", () => {
  it("reads a pending state with the shared profile revision", async () => {
    const db = fakePool();
    await expect(readAccountOnboarding(db.pool, auth)).resolves.toMatchObject({
      account_id: auth.accountId,
      user_id: auth.userId,
      display_name: "Ada",
      focus: "",
      profile_url: "",
      status: "pending",
      revision: 1,
    });
  });

  it("refuses replay after another profile change instead of confirming newer content", async () => {
    const db = fakePool();
    await mutateAccountOnboarding(db.pool, auth, mutation);
    db.state.user.profile_revision = 3;
    db.state.user.onboarding_focus = "Newer work in another tab";
    await expect(mutateAccountOnboarding(db.pool, auth, mutation)).rejects.toMatchObject({ code: "ONBOARDING_STALE" });
  });

  it("writes status and clears focus/profile URL with an audit revision only", async () => {
    const db = fakePool();
    const saved = await mutateAccountOnboarding(db.pool, auth, mutation);
    expect(saved).toMatchObject({
      display_name: "Ada Lovelace",
      focus: "Staff backend roles in Europe",
      profile_url: "https://example.test/ada",
      status: "completed",
      revision: 2,
    });

    const cleared = await mutateAccountOnboarding(db.pool, auth, {
      ...mutation,
      id: "40000000-0000-4000-8000-000000000002",
      expected_revision: 2,
      focus: "",
      profile_url: "",
      status: "skipped",
    });
    expect(cleared).toMatchObject({ focus: "", profile_url: "", status: "skipped", revision: 3 });

    const insert = db.state.queries.find(([sql]) =>
      sql.startsWith("INSERT INTO account_access_events"),
    );
    const details = JSON.parse(String(insert?.[1][4]));
    expect(Object.keys(details).sort()).toEqual([
      "revision_after",
      "revision_before",
      "status_after",
      "status_before",
    ]);
    expect(JSON.stringify(details)).not.toContain("Ada Lovelace");
    expect(JSON.stringify(details)).not.toContain("example.test");
  });

  it("scopes every read and write to the authenticated account and user", async () => {
    const db = fakePool();
    await readAccountOnboarding(db.pool, auth);
    await mutateAccountOnboarding(db.pool, auth, mutation);

    const sessionQuery = db.state.queries.find(([sql]) =>
      sql.includes("FROM sessions"),
    );
    expect(sessionQuery?.[1].slice(0, 3)).toEqual([
      auth.sessionId,
      auth.accountId,
      auth.userId,
    ]);

    const userReads = db.state.queries.filter(([sql]) =>
      sql.includes("FROM users"),
    );
    expect(userReads.length).toBeGreaterThan(0);
    for (const [, parameters] of userReads) {
      expect(parameters.slice(0, 2)).toEqual([auth.accountId, auth.userId]);
    }

    const eventInsert = db.state.queries.find(([sql]) =>
      sql.startsWith("INSERT INTO account_access_events"),
    );
    expect(eventInsert?.[1][1]).toBe(auth.accountId);
    expect(eventInsert?.[1][2]).toBe(auth.userId);
  });

  it("replays the same request idempotently without advancing the revision", async () => {
    const db = fakePool();
    const first = await mutateAccountOnboarding(db.pool, auth, mutation);
    const replay = await mutateAccountOnboarding(db.pool, auth, mutation);
    expect(replay).toEqual(first);
    expect(
      db.state.queries.filter(([sql]) => sql.startsWith("UPDATE users")),
    ).toHaveLength(1);
  });

  it("conflicts when the same operation ID carries a different payload", async () => {
    const db = fakePool();
    await mutateAccountOnboarding(db.pool, auth, mutation);
    await expect(
      mutateAccountOnboarding(db.pool, auth, {
        ...mutation,
        expected_revision: 2,
        focus: "Different focus",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_OPERATION_CONFLICT" });
  });

  it("rejects a stale expected revision", async () => {
    const db = fakePool();
    await mutateAccountOnboarding(db.pool, auth, mutation);
    await expect(
      mutateAccountOnboarding(db.pool, auth, {
        ...mutation,
        id: "40000000-0000-4000-8000-000000000003",
        expected_revision: 1,
      }),
    ).rejects.toMatchObject({ code: "ONBOARDING_STALE" });
  });

  it("rejects an unsafe saved profile URL", async () => {
    const db = fakePool();
    await expect(
      mutateAccountOnboarding(db.pool, auth, {
        ...mutation,
        profile_url: "https://127.0.0.1/ada",
      }),
    ).rejects.toMatchObject({ code: "ONBOARDING_PROFILE_URL_INVALID" });
  });

  it("rejects lab and revoked users before writing", async () => {
    const lab = fakePool({ kind: "lab_human" });
    await expect(mutateAccountOnboarding(lab.pool, auth, mutation)).rejects.toMatchObject(
      { code: "TEST_ACCOUNT_READ_ONLY" },
    );
    const revoked = fakePool({ status: "revoked" });
    await expect(
      mutateAccountOnboarding(revoked.pool, auth, mutation),
    ).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });
});

describe("bounded profile preview", () => {
  it("returns a short excerpt from one injected page load", async () => {
    const loader = vi.fn(async () => ({
      canonicalUrl: "https://example.test/ada",
      contentHash: "hash",
      retrievedAt: new Date("2026-09-20T00:00:00.000Z"),
      text: `  ${"Staff engineer. ".repeat(80)}  `,
      links: ["https://example.test/other"],
    }));
    const preview = await previewPublicProfilePage(
      "https://example.test/ada",
      loader as never,
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(preview.profileUrl).toBe("https://example.test/ada");
    expect(preview.excerpt.length).toBeLessThanOrEqual(600);
    expect(preview.retrievedAt.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it.each([
    "not a url",
    "http://example.test/ada",
    "https://user:pass@example.test/ada",
    "https://127.0.0.1/ada",
    "https://localhost/ada",
    "https://printer.local/ada",
    "https://singlelabel/ada",
  ])("rejects %s without loading", async (value) => {
    const loader = vi.fn();
    await expect(
      previewPublicProfilePage(value, loader as never),
    ).rejects.toMatchObject({ code: "ONBOARDING_PREVIEW_URL_INVALID" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("passes a validated-but-unreadable failure through as a readable error", async () => {
    await expect(
      previewAccountOnboardingProfile("http://example.test/ada"),
    ).rejects.toMatchObject({ code: "ONBOARDING_PREVIEW_URL_INVALID" });
  });
});
