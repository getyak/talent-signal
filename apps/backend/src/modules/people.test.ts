import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { sha256 } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import { listPeople, searchPeople } from "./people.js";

const auth: AuthContext = {
  accountId: "11111111-1111-4111-8111-111111111111",
  accountSlug: "fixture-alpha",
  userId: "22222222-2222-4222-8222-222222222222",
  userEmail: "recruiter@alpha.local",
  userKind: "simulated_human",
  sessionId: "33333333-3333-4333-8333-333333333333",
};

describe("people directory", () => {
  it("returns account-scoped people and their recent relationship contexts", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_label: "周屿",
          context_count: 2,
          capture_count: 4,
          confirmed_identity_count: 1,
          last_activity_at: new Date("2026-08-06T10:00:00.000Z"),
          name_match: true,
          matched_handle_status: null,
          matched_handle_type: null,
          matched_handle_hint: null,
          matched_handle_source_resource_id: null,
          matched_handle_valid_until: null,
          contexts: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              display_label: "VP Product · Northstar search",
              last_activity_at: "2026-08-06T10:00:00.000Z",
            },
          ],
        },
      ],
    });

    const response = await listPeople(
      { query } as unknown as Pool,
      auth,
      "  周屿  ",
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([
      auth.accountId,
      "周屿",
      null,
      null,
    ]);
    expect(response.people).toEqual([
      {
        id: "44444444-4444-4444-8444-444444444444",
        display_label: "周屿",
        context_count: 2,
        capture_count: 4,
        confirmed_identity_count: 1,
        last_activity_at: "2026-08-06T10:00:00.000Z",
        profile: null,
        contexts: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            display_label: "VP Product · Northstar search",
            last_activity_at: "2026-08-06T10:00:00.000Z",
          },
        ],
        identity_matches: [{ kind: "name" }],
      },
    ]);
  });

  it("returns a user-authored profile without turning it into evidence", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_label: "cubxxw",
          context_count: 0,
          capture_count: 0,
          confirmed_identity_count: 0,
          last_activity_at: new Date("2026-08-26T10:00:00.000Z"),
          name_match: false,
          matched_handle_status: null,
          matched_handle_type: null,
          matched_handle_hint: null,
          matched_handle_source_resource_id: null,
          matched_handle_valid_until: null,
          profile_headline: "Talent Signal 创建者",
          profile_summary: "由工作区所有者明确写入的人物介绍。",
          profile_provenance_kind: "user_authored",
          profile_authored_by_user_id: auth.userId,
          profile_revision: 1,
          profile_updated_at: new Date("2026-08-26T10:00:00.000Z"),
          contexts: [],
        },
      ],
    });

    const response = await listPeople({ query } as unknown as Pool, auth);

    expect(response.people[0]).toMatchObject({
      display_label: "cubxxw",
      capture_count: 0,
      confirmed_identity_count: 0,
      profile: {
        headline: "Talent Signal 创建者",
        summary: "由工作区所有者明确写入的人物介绍。",
        provenance_kind: "user_authored",
        authored_by_user_id: auth.userId,
        revision: 1,
        updated_at: "2026-08-26T10:00:00.000Z",
      },
    });
  });

  it("finds a person by a confirmed handle without putting raw data in SQL parameters", async () => {
    const sourceResourceId =
      "66666666-6666-4666-8666-666666666666";
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_label: "周屿",
          context_count: 1,
          capture_count: 2,
          confirmed_identity_count: 1,
          last_activity_at: new Date("2026-08-06T10:00:00.000Z"),
          name_match: false,
          matched_handle_status: "confirmed",
          matched_handle_type: "email",
          matched_handle_hint: "z•••@example.com",
          matched_handle_source_resource_id: sourceResourceId,
          matched_handle_valid_until: new Date(
            "2027-08-06T10:00:00.000Z",
          ),
          contexts: [],
        },
      ],
    });

    const response = await searchPeople(
      { query } as unknown as Pool,
      auth,
      "ZHOU.YU@example.com",
    );

    expect(query.mock.calls[0]?.[1]).toEqual([
      auth.accountId,
      "",
      "email",
      sha256("zhou.yu@example.com"),
    ]);
    expect(query.mock.calls[0]?.[1]).not.toContain(
      "ZHOU.YU@example.com",
    );
    expect(response.people[0]?.identity_matches).toEqual([
      {
        kind: "confirmed_handle",
        handle_type: "email",
        display_hint: "z•••@example.com",
        source_resource_id: sourceResourceId,
      },
    ]);
  });

  it("returns an expired handle only as a stale review clue", async () => {
    const sourceResourceId =
      "66666666-6666-4666-8666-666666666666";
    const expiredAt = new Date("2026-08-01T00:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          display_label: "周屿",
          context_count: 1,
          capture_count: 2,
          confirmed_identity_count: 0,
          last_activity_at: new Date("2026-08-06T10:00:00.000Z"),
          name_match: false,
          matched_handle_status: "expired",
          matched_handle_type: "email",
          matched_handle_hint: "z•••@example.com",
          matched_handle_source_resource_id: sourceResourceId,
          matched_handle_valid_until: expiredAt,
          contexts: [],
        },
      ],
    });

    const response = await searchPeople(
      { query } as unknown as Pool,
      auth,
      "zhou.yu@example.com",
    );

    expect(response.people[0]?.identity_matches).toEqual([
      {
        kind: "expired_handle",
        handle_type: "email",
        display_hint: "z•••@example.com",
        source_resource_id: sourceResourceId,
        expired_at: expiredAt.toISOString(),
      },
    ]);
    expect(query.mock.calls[0]?.[0]).toContain(
      "handles.status IN ('confirmed', 'expired')",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "handles.valid_until > now()",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "WHEN 'confirmed' THEN 0",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "WHEN 'expired' THEN 1",
    );
  });

  it("keeps an unknown handle search empty instead of returning the directory", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    const response = await searchPeople(
      { query } as unknown as Pool,
      auth,
      "unknown@example.com",
    );

    expect(response.people).toEqual([]);
    expect(query.mock.calls[0]?.[0]).toContain("$2 <> ''");
    expect(query.mock.calls[0]?.[1]).toEqual([
      auth.accountId,
      "",
      "email",
      sha256("unknown@example.com"),
    ]);
  });
});
