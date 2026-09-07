import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { bundledPrompt } from "@talent-signal/agent/prompt-registry";
import { loadedRelationshipTaskConfiguration } from "@talent-signal/agent";
import { digestCanonicalJson } from "@talent-signal/evaluation";
import { registerLoadedRuntimeConfiguration, loadedRuntimeConfiguration } from "./runtimeManifest.js";
import { ZhipuChatAnswerProvider } from "./chatAnswerProvider.js";
import type { BackendConfig } from "../config.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const config = { internalLabEnabled: true, port: 4317 } as BackendConfig;
function appWith(enabled: boolean) {
  const app = Fastify(); apps.push(app);
  registerLoadedRuntimeConfiguration(app, { ...config, internalLabEnabled: enabled },
    async (request, reply) => {
      if (request.headers.authorization !== "Bearer synthetic-reviewer") {
        await reply.status(401).send({ error: "unauthorized" });
      }
    }, loadedRelationshipTaskConfiguration("glm-4.7"));
  return app;
}
describe("loaded runtime configuration readback", () => {
  it("reports the actual compiled snapshots without text and preserves in-flight policy", async () => {
    const app = appWith(true);
    const response = await app.inject({ method: "GET", url: "/v1/lab/runtime-configuration",
      headers: { authorization: "Bearer synthetic-reviewer" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const value = response.json();
    expect(value.prompts.find((item: { name: string }) => item.name === "assistant/relationship"))
      .toMatchObject({ revision: bundledPrompt("assistant/relationship").revision, source: "bundled" });
    expect(value.prompts.every((item: object) => !("text" in item))).toBe(true);
    expect(value.prompt_catalogue_digest).toBe(digestCanonicalJson(value.prompts));
    expect(value.in_flight_policy).toBe("retain_captured_snapshot");
    expect(value.release_authority).toBe("none");
    // Vitest loads TypeScript source, so it must not attest to an emitted deployment.
    expect(value.build_source_digest).toBeNull();
    expect(value.relationship_task).toEqual(loadedRelationshipTaskConfiguration("glm-4.7"));
    expect(value.relationship_task.taskConfigurationDigest).toBe(digestCanonicalJson(value.relationship_task.configuration));
    const second = await app.inject({ method: "GET", url: "/v1/lab/runtime-configuration",
      headers: { authorization: "Bearer synthetic-reviewer" } });
    expect(second.json().process_instance_id).toBe(value.process_instance_id);
  });
  it("requires authentication and internal capability", async () => {
    const unauthorized = await appWith(true).inject({ method: "GET", url: "/v1/lab/runtime-configuration" });
    expect(unauthorized.statusCode).toBe(401);
    const disabled = await appWith(false).inject({ method: "GET", url: "/v1/lab/runtime-configuration",
      headers: { authorization: "Bearer synthetic-reviewer" } });
    expect(disabled.statusCode).toBe(403);
  });
  it("captures the actual provider timeout and refuses to infer absent provider configuration", () => {
    const provider = new ZhipuChatAnswerProvider({ apiKey: "synthetic", model: "glm-4.7", timeoutMs: 30000 });
    const value = loadedRuntimeConfiguration(config, provider.loadedTaskConfiguration);
    expect(value.relationship_task).toEqual(loadedRelationshipTaskConfiguration("glm-4.7", 30000));
    expect(value.relationship_task?.taskConfigurationDigest).not.toBe(loadedRelationshipTaskConfiguration("glm-4.7").taskConfigurationDigest);
    expect(loadedRuntimeConfiguration(config).relationship_task).toBeNull();
  });
});
