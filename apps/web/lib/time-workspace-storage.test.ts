// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTimeOperation, clearTimeWorkspaceStorage, pendingTimeOperation, purgeExpiredTimeWorkspaceStorage, rememberTimeOperation } from "./time-workspace-storage";
import { timeFixtureId, timeFixtureMutation } from "./test/time-fixtures";
beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
const receipt = () => ({ id: timeFixtureId, key: timeFixtureMutation.idempotency_key, method: "PUT" as const, expectedRevision: 0, expires: Date.now() + 86400000, body: timeFixtureMutation });
describe("account-bound time operation storage", () => {
  it("refuses to replace an unresolved operation with another record or new intent", () => {
    const first = receipt(); expect(rememberTimeOperation("a", first)).toBe(true);
    expect(rememberTimeOperation("a", { ...first, id: "b3000000-0000-4000-8000-000000000001" })).toBe(false);
    expect(rememberTimeOperation("a", { ...first, key: "b4000000-0000-4000-8000-000000000001", body: { ...first.body, idempotency_key: "b4000000-0000-4000-8000-000000000001" } })).toBe(false);
    expect(pendingTimeOperation("a")).toEqual(first);
    expect(rememberTimeOperation("a", first)).toBe(true);
  });
  it("ignores obsolete completions clearing another intent", () => {
    const first = receipt(); rememberTimeOperation("a", first);
    clearTimeOperation("a", { id: first.id, key: "b4000000-0000-4000-8000-000000000001" }); expect(pendingTimeOperation("a")).toEqual(first);
    clearTimeOperation("a", { id: "b3000000-0000-4000-8000-000000000001" }); expect(pendingTimeOperation("a")).toEqual(first);
    clearTimeOperation("a", { id: first.id, key: first.key }); expect(pendingTimeOperation("a")).toBeNull();
  });
  it("clears all old account bindings at logout, preserving unrelated storage", () => {
    rememberTimeOperation("a", receipt()); rememberTimeOperation("b", receipt());
    sessionStorage.setItem("talent-signal:time-edit:old", "private"); sessionStorage.setItem("unrelated", "retain");
    clearTimeWorkspaceStorage(); expect(Object.keys(sessionStorage)).toEqual(["unrelated"]);
  });
  it("purges expired old bindings without needing to reopen their account", () => {
    rememberTimeOperation("a", receipt()); vi.useFakeTimers(); vi.setSystemTime(Date.now() + 86400001);
    purgeExpiredTimeWorkspaceStorage(); expect(Object.keys(sessionStorage)).toEqual([]); vi.useRealTimers();
  });
});
