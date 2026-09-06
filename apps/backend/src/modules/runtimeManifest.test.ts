import { describe, expect, it } from "vitest";
import type { BackendConfig } from "../config.js";
import { runtimeManifest } from "./runtimeManifest.js";

const config = { port: 4329, appleSignInEnabled: true, passwordAuthEnabled: false,
  simulatedAuthEnabled: false, internalLabEnabled: true } as BackendConfig;
describe("deployment preflight identity", () => {
  it("reports actual configured identity without exposing credentials or account state", () => {
    const value = runtimeManifest(config, { NODE_ENV: "production", TALENT_SIGNAL_DEPLOYMENT_ID: "internal-stable",
      TALENT_SIGNAL_BACKEND_REVISION: "revision-a", TALENT_SIGNAL_DATA_DOMAIN: "internal-synthetic",
      ZHIPU_API_KEY: "must-never-be-returned" });
    expect(value).toMatchObject({ service: "talent-signal", deployment_id: "internal-stable",
      revision: "revision-a", data_domain: "internal-synthetic", authentication: { simulated: false } });
    expect(JSON.stringify(value)).not.toContain("must-never-be-returned");
  });
  it("does not invent production deployment identity", () => {
    expect(runtimeManifest(config, { NODE_ENV: "production" }).deployment_id).toBeNull();
    expect(runtimeManifest(config, { NODE_ENV: "development" }).deployment_id).toBe("local-4329");
  });
});
