import { describe, expect, it } from "vitest";
import {
  isWorkspaceSearchShortcut,
  searchWorkspaceResults,
  workspaceSearchMatches,
} from "./workspace-search";

const people = [
  { id: "p1", label: "陈曦", detail: "星河资本 · 产品负责人", avatarUrl: null },
  { id: "p2", label: "Lin Shan", detail: "澄川科技", avatarUrl: null },
];
const sessions = [
  { id: "s1", title: "准备与陈曦的沟通", detail: "陈曦 · 产品负责人寻访" },
  { id: "s2", title: "梳理寻访标准", detail: "账号专属对话" },
];

describe("workspace search", () => {
  it("returns nothing for an empty query instead of every record", () => {
    expect(searchWorkspaceResults({ people, sessions, query: "   " })).toEqual({
      people: [],
      sessions: [],
      total: 0,
    });
  });

  it("matches people and sessions without inventing results", () => {
    const result = searchWorkspaceResults({ people, sessions, query: "陈曦" });
    expect(result.people.map((person) => person.id)).toEqual(["p1"]);
    expect(result.sessions.map((session) => session.id)).toEqual(["s1"]);
    expect(result.total).toBe(2);
  });

  it("normalizes width, case and NFKC before matching", () => {
    expect(workspaceSearchMatches("Ｌｉｎ Ｓｈａｎ", "lin shan")).toBe(true);
    expect(workspaceSearchMatches("星河资本", "星河")).toBe(true);
    expect(workspaceSearchMatches("星河资本", "澄川")).toBe(false);
  });

  it("bounds each group independently", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `p${index}`,
      label: `候选 ${index}`,
      detail: "星河资本",
      avatarUrl: null,
    }));
    const result = searchWorkspaceResults({
      people: many,
      sessions: [],
      query: "星河",
      limit: 3,
    });
    expect(result.people).toHaveLength(3);
  });

  it("recognizes only the intentional global shortcut", () => {
    expect(
      isWorkspaceSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: false }),
    ).toBe(true);
    expect(
      isWorkspaceSearchShortcut({ key: "K", metaKey: false, ctrlKey: true, altKey: false }),
    ).toBe(true);
    expect(
      isWorkspaceSearchShortcut({ key: "k", metaKey: true, ctrlKey: false, altKey: true }),
    ).toBe(false);
    expect(
      isWorkspaceSearchShortcut({ key: "j", metaKey: true, ctrlKey: false, altKey: false }),
    ).toBe(false);
    expect(
      isWorkspaceSearchShortcut({ key: "k", metaKey: false, ctrlKey: false, altKey: false }),
    ).toBe(false);
  });
});
