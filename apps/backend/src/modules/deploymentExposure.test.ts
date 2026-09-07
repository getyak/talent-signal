import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { relationshipTaskConfiguration, taskConfigurationDigest } from "@talent-signal/agent";
import { captureDeploymentExposure, assertCandidateDeploymentExposure } from "./deploymentExposure.js";
import { createAuthGuard } from "./auth.js";
import { loadedRuntimeConfiguration } from "./runtimeManifest.js";
import type { BackendConfig } from "../config.js";

const first = "11111111-1111-4111-8111-111111111111", second = "22222222-2222-4222-8222-222222222222";
const settings = (workspaceIds = [first]) => ({ TALENT_SIGNAL_DEPLOYMENT_EXPOSURE:
  JSON.stringify({ schemaVersion: "phase-one-deployment-exposure.v1", workspaceIds, percentage: 100 }) });
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe("actual deployment audience", () => {
  it("preserves baseline defaults and rejects incomplete, duplicate or fractional scopes", () => {
    expect(captureDeploymentExposure({})).toBeNull();
    expect(() => captureDeploymentExposure(settings([]))).toThrow("DEPLOYMENT_EXPOSURE_INVALID");
    expect(() => captureDeploymentExposure(settings([first, first]))).toThrow("DEPLOYMENT_EXPOSURE_INVALID");
    expect(() => captureDeploymentExposure({ TALENT_SIGNAL_DEPLOYMENT_EXPOSURE: settings().TALENT_SIGNAL_DEPLOYMENT_EXPOSURE.replace("100", "10") })).toThrow("DEPLOYMENT_EXPOSURE_INVALID");
    const scope = captureDeploymentExposure(settings([second, first]))!;
    expect(scope.workspaceIds).toEqual([first, second]);
    expect(Object.isFrozen(scope.workspaceIds)).toBe(true);
  });
  it("denies a signed-in workspace outside the captured audience before any handler runs", async () => {
    let accountID = first, calls = 0;
    const pool = { async query() { return { rows: [{ account_id: accountID, account_slug: "fixture", user_id: first,
      user_email: "fixture@example.test", user_kind: "simulated_human", session_id: first }] }; } } as unknown as Pool;
    const mutable = [first];
    const app = Fastify(); apps.push(app);
    app.get("/private", { preHandler: createAuthGuard(pool, mutable) }, async () => { calls++; return { done: true }; });
    mutable.push(second); // A caller cannot expand a running guard after startup.
    expect((await app.inject({ url: "/private" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/private", headers: { authorization: "Bearer synthetic" } })).statusCode).toBe(200);
    accountID = second;
    const denied = await app.inject({ url: "/private", headers: { authorization: "Bearer synthetic" } });
    expect(denied.statusCode).toBe(403);
    expect(calls).toBe(1);
  });
  it("refuses a candidate without enforced scope and reports that exact scope digest", () => {
    const configuration = relationshipTaskConfiguration("glm-4.7", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "concise", exampleIds: [] });
    const loaded = { configuration, taskConfigurationDigest: taskConfigurationDigest(configuration) };
    expect(() => assertCandidateDeploymentExposure(null, loaded)).toThrow("CANDIDATE_DEPLOYMENT_EXPOSURE_REQUIRED");
    const scope = captureDeploymentExposure(settings())!;
    expect(() => assertCandidateDeploymentExposure(scope, loaded)).not.toThrow();
    const readback = loadedRuntimeConfiguration({} as BackendConfig, loaded, scope);
    expect(readback.deployment_exposure_digest).toBe(taskConfigurationDigest(scope));
    expect(loadedRuntimeConfiguration({} as BackendConfig).deployment_exposure_digest).toBeNull();
  });
});
