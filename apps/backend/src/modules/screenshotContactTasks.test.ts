import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AuthContext } from "./auth.js";
import { environmentScreenshotContactDependencies, loadScreenshotContactTask } from "./screenshotContactTasks.js";
import { ARK_SCREENSHOT_PREPROCESS_MODEL } from "@talent-signal/agent";

const row = {
  id: "synthetic-task", status: "completed", revision: 1,
  expires_at: new Date("2099-01-01"), created_at: new Date(), updated_at: new Date(),
  capture_id: "synthetic-capture", input_manifest: {}, state: { response: {} },
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

describe("screenshot preprocessing configuration",()=>{
  it("stays disabled with the product gate",()=>{
    expect(environmentScreenshotContactDependencies({})).toBeNull();
  });
  it("fails closed without sensitive-processing admission or an Ark credential",()=>{
    expect(()=>environmentScreenshotContactDependencies({TALENT_SIGNAL_SCREENSHOT_CONTACT_AGENT_ENABLED:"true"}))
      .toThrow("CONTACT_AGENT_SENSITIVE_AI_NOT_ENABLED");
    expect(()=>environmentScreenshotContactDependencies({TALENT_SIGNAL_SCREENSHOT_CONTACT_AGENT_ENABLED:"true",
      TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING:"true"})).toThrow("SCREENSHOT_PREPROCESS_CREDENTIAL_REQUIRED");
  });
  it("pins the shared Ark Lite preprocessor independently of the downstream model",()=>{
    const dependencies=environmentScreenshotContactDependencies({TALENT_SIGNAL_SCREENSHOT_CONTACT_AGENT_ENABLED:"true",
      TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING:"true",ARK_API_KEY:"synthetic-ark",ZHIPU_API_KEY:"synthetic-zhipu"});
    expect(dependencies?.preprocessor).toMatchObject({provider:"volcano_ark",model:ARK_SCREENSHOT_PREPROCESS_MODEL});
  });
});
