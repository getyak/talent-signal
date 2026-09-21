import { beforeEach, describe, expect, it, vi } from "vitest";
import { TalentSignalHttpError } from "@talent-signal/contracts";
import { timeFixtureId, timeFixtureMutation, timeFixtureResponse } from "@/lib/test/time-fixtures";
const mock = vi.hoisted(() => ({ claims: vi.fn(), origin: vi.fn(), activities: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: mock.claims }));
vi.mock("@/lib/request-origin", () => ({ isAllowedMutationOrigin: mock.origin }));
vi.mock("@/lib/server/workspaceSessions", () => ({ workspaceSessionsBinding: () => "binding", isWorkspaceSessionId: (id: string) => /^[0-9a-f-]{36}$/iu.test(id) }));
vi.mock("@/lib/server/timeWorkspace", () => ({ loadTimeActivities: mock.activities, loadTimeSchedule: mock.read, saveTimeSchedule: mock.save, removeTimeSchedule: mock.remove, reviewTimeScope: mock.review }));
import { GET as activities } from "./activities/route";
import { GET, PUT, DELETE } from "./schedules/[id]/route";
import { POST as exportFile } from "./schedules/[id]/export/route";
import { POST as review } from "./review/route";
const context = { params: Promise.resolve({ id: timeFixtureId }) };
function request(method: string, body?: unknown, binding = "binding", query = "") {
  return new Request(`http://localhost:3000/api/time${query}`, { method, headers: { "content-type": "application/json", "x-workspace-session": binding }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mock.origin.mockReturnValue(true); mock.claims.mockResolvedValue({ backendExpiresAt: "2099-01-01T00:00:00.000Z" });
  mock.read.mockResolvedValue(timeFixtureResponse); mock.save.mockResolvedValue(timeFixtureResponse); mock.remove.mockResolvedValue(timeFixtureResponse);
  mock.activities.mockResolvedValue({ activities: [] }); mock.review.mockResolvedValue({ body: "Review" });
});
describe("time workspace browser/server boundary", () => {
  it("requires the current account binding on reads and writes", async () => {
    expect((await GET(request("GET", undefined, "old"), context)).status).toBe(409);
    expect((await PUT(request("PUT", timeFixtureMutation, "old"), context)).status).toBe(409);
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
    mock.claims.mockResolvedValue(null);
    expect((await activities(request("GET"))).status).toBe(401);
  });
  it("rejects cross-origin mutations and never trusts caller account fields", async () => {
    mock.origin.mockReturnValue(false);
    expect((await PUT(request("PUT", timeFixtureMutation), context)).status).toBe(403);
    mock.origin.mockReturnValue(true);
    expect((await PUT(request("PUT", { ...timeFixtureMutation, account_id: timeFixtureId }), context)).status).toBe(400);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("forwards exact revision/idempotency inputs and sends no-store receipts", async () => {
    const result = await PUT(request("PUT", timeFixtureMutation), context);
    expect(mock.save).toHaveBeenCalledWith(timeFixtureId, timeFixtureMutation);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toMatchObject({ session_version: "binding", schedule: { id: timeFixtureId } });
    const deletion = { expected_revision: 1, idempotency_key: timeFixtureMutation.idempotency_key };
    await DELETE(request("DELETE", deletion), context);
    expect(mock.remove).toHaveBeenCalledWith(timeFixtureId, deletion);
  });
  it("revalidates export revision and state with a fresh authoritative read", async () => {
    expect((await exportFile(request("POST", { expected_revision: 2 }), context)).status).toBe(409);
    mock.read.mockResolvedValue({ ...timeFixtureResponse, schedule: { ...timeFixtureResponse.schedule, status: "deleted", content_available: false } });
    expect((await exportFile(request("POST", { expected_revision: 1 }), context)).status).toBe(409);
    mock.read.mockResolvedValue(timeFixtureResponse);
    const exported = await exportFile(request("POST", { expected_revision: 1 }), context);
    expect(exported.headers.get("content-type")).toContain("text/calendar");
    expect(await exported.text()).not.toContain("Private note");
  });
  it("preserves a disabled provider as unavailable and never invents a review", async () => {
    mock.review.mockRejectedValue(new TalentSignalHttpError(503, "TIME_REVIEW_DISABLED", "sensitive provider detail", null));
    const result = await review(request("POST", { scope: { from: "2026-09-20", to: "2026-09-21", time_zone: "UTC" }, objective: "Review" }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("sensitive provider detail");
  });
  it("rejects unknown and repeated query keys before loading activities", async () => {
    const query = "?from=2026-09-20&to=2026-09-21&time_zone=UTC";
    expect((await activities(request("GET", undefined, "binding", `${query}&account_id=${timeFixtureId}`))).status).toBe(400);
    expect((await activities(request("GET", undefined, "binding", `${query}&from=2026-09-01`))).status).toBe(400);
    expect(mock.activities).not.toHaveBeenCalled();
    expect((await activities(request("GET", undefined, "binding", query))).status).toBe(200);
  });
});
