import { expect, it } from "vitest";
import { recentSessionRows, unexpiredRecentSessions } from "./workspace-recent-sessions";
const active = { session_id: "00000000-0000-4000-8000-000000000001", state: "active", title: "准备下次沟通", expires_at: "2030-01-01T00:00:00Z", is_unread: true };
it("does not reveal another session binding's titles", () => {
  expect(recentSessionRows({ session_version: "other", sessions: [active] }, "current", 0)).toBeNull();
});
it("omits expired, deleted, malformed and duplicate records", () => {
  expect(recentSessionRows({ session_version: "current", sessions: [
    { ...active, state: "deleted" }, { ...active, expires_at: "1970-01-01T00:00:00Z" },
    { ...active, expires_at: "invalid" }, { ...active, session_id: "../../settings" }, active, active,
  ] }, "current", 1)).toEqual([{ id: active.session_id, title: active.title, unread: true, expiresAt: Date.parse(active.expires_at) }]);
});

it("removes a known expired title without a network response", () => {
  const rows = recentSessionRows({ session_version: "current", sessions: [active] }, "current", 0)!;
  const expiry = Date.parse(active.expires_at);
  expect(unexpiredRecentSessions(rows, expiry - 1)).toHaveLength(1);
  expect(unexpiredRecentSessions(rows, expiry)).toEqual([]);
});
