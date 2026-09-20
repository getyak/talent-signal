import { describe, expect, it } from "vitest";
import {
  relatedSessionsForPerson,
  sidebarPeopleFromDirectory,
  sidebarPersonHref,
  sidebarSessionRows,
} from "./workspace-sidebar";

const directory = {
  contract_version: "1.0.0",
  people: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      display_label: "陈曦",
      context_count: 1,
      capture_count: 2,
      confirmed_identity_count: 1,
      last_activity_at: "2026-09-18T00:00:00Z",
      profile: null,
      avatar: null,
      contexts: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          display_label: "产品负责人寻访",
          last_activity_at: "2026-09-18T00:00:00Z",
        },
      ],
      identity_matches: [],
    },
  ],
};

const sessions = {
  session_version: "binding",
  sessions: [
    {
      session_id: "33333333-3333-4333-8333-333333333333",
      title: "准备与陈曦的沟通",
      state: "active",
      person_id: "11111111-1111-4111-8111-111111111111",
    },
    {
      session_id: "44444444-4444-4444-8444-444444444444",
      title: "已删除的对话",
      state: "deleted",
      person_id: "11111111-1111-4111-8111-111111111111",
    },
  ],
};

describe("sidebar people hierarchy", () => {
  it("rejects malformed or unbounded directory payloads", () => {
    expect(sidebarPeopleFromDirectory(null)).toEqual([]);
    expect(sidebarPeopleFromDirectory({ people: "nope" })).toEqual([]);
    expect(
      sidebarPeopleFromDirectory({ people: [{ display_label: "缺少 id" }] }),
    ).toEqual([]);
  });

  it("maps the real directory projection and bounds it", () => {
    const people = sidebarPeopleFromDirectory(directory, 1);
    expect(people).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        label: "陈曦",
        detail: "产品负责人寻访",
        avatarUrl: null,
        contexts: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            label: "产品负责人寻访",
          },
        ],
      },
    ]);
  });

  it("pairs sessions only through the canonical person id and active state", () => {
    const rows = sidebarSessionRows(sessions);
    expect(rows).toHaveLength(2);
    const related = relatedSessionsForPerson(
      rows,
      "11111111-1111-4111-8111-111111111111",
    );
    expect(related.map((row) => row.title)).toEqual(["准备与陈曦的沟通"]);
    expect(relatedSessionsForPerson(rows, "55555555-5555-4555-8555-555555555555")).toEqual([]);
  });

  it("prefers a real relationship context when deep-linking a person", () => {
    const [person] = sidebarPeopleFromDirectory(directory, 1);
    expect(sidebarPersonHref(person)).toBe(
      "/workspace?person=11111111-1111-4111-8111-111111111111&context=22222222-2222-4222-8222-222222222222",
    );
    expect(
      sidebarPersonHref({ ...person, contexts: [] }),
    ).toBe("/workspace?person=11111111-1111-4111-8111-111111111111");
  });
});
