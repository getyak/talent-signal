import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthContext } from "./auth.js";
import { loadScreenshotContactTask } from "./screenshotContactTasks.js";

const row = {
  id: "synthetic-task", status: "completed", revision: 1,
  expires_at: new Date("2099-01-01"), created_at: new Date(), updated_at: new Date(),
  capture_id: "synthetic-capture", state: { response: {} },
};
const auth = { accountId: "synthetic-account", userId: "synthetic-owner" } as AuthContext;
describe("capture availability readback", () => {
  it("propagates a transient directory lookup failure instead of claiming deletion", async () => {
    const failure = new Error("connection timeout");
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] }).mockRejectedValueOnce(failure);
    await expect(loadScreenshotContactTask({ query } as unknown as Pool, auth, row.id)).rejects.toBe(failure);
  });
  it("propagates a transient source lookup failure instead of claiming deletion", async () => {
    const failure = new Error("query timeout");
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ available: true }] }).mockRejectedValueOnce(failure);
    await expect(loadScreenshotContactTask({ query } as unknown as Pool, auth, row.id)).rejects.toBe(failure);
  });
  it("still hides a source when the database proves it unavailable", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ available: true }] }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await loadScreenshotContactTask({ query } as unknown as Pool, auth, row.id))
      .toMatchObject({ status: "deleted", contact: null, capture_id: null });
  });
});
