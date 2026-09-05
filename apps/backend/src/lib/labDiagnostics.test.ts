import { executeUnscopedChatTask } from "../modules/unscopedChat.js";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { LAB_DIAGNOSTIC_REQUEST, LAB_DIAGNOSTIC_RESPONSE, measureLabServerStage, registerLabDiagnostics } from "./labDiagnostics.js";

const apps: ReturnType<typeof Fastify>[] = [];
function decode(value: string) { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; }
async function testApp(enabled = true) {
  const app = Fastify(); apps.push(app);
  app.decorateRequest("auth", null as never);
  registerLabDiagnostics(app, enabled, "synthetic_fixture");
  app.get("/v1/test", { preHandler(request, _reply, done) {
    request.auth = { accountId: "synthetic-account", accountSlug: "fixture", userId: "synthetic-user", userEmail: "fixture@example.test", userKind: "simulated_human", sessionId: "synthetic-session" }; done();
  } }, async () => measureLabServerStage("context", async () => {
    await new Promise(resolve => setTimeout(resolve, 5)); return { ok: true };
  }));
  app.get("/v1/failure", { preHandler(request, _reply, done) {
    request.auth = { accountId: "synthetic-account", accountSlug: "fixture", userId: "synthetic-user", userEmail: "fixture@example.test", userKind: "simulated_human", sessionId: "synthetic-session" }; done();
  } }, async () => measureLabServerStage("model_adapter", async () => { throw new Error("private-provider-error"); }));
  app.get("/v1/unscoped", async () => measureLabServerStage("context", async () => ({ ok: true })));
  app.get("/health/live", async () => ({ ok: true }));
  app.get("/health/ready", async () => {
    const execution = await executeUnscopedChatTask({
      request: { idempotency_key: "diagnostic-fixture", objective: "synthetic-private-objective" },
      provider: { providerId: "zhipu-chat-completions", model: "synthetic-model", supportsImageInput: false,
        answer: async () => ({ kind: "answer", title: "Synthetic", body: "synthetic-private-result", citation_ids: [],
          provider_id: "zhipu-chat-completions", model: "synthetic-model", provider_request_id: null, input_tokens: 0, output_tokens: 0 }) },
    });
    return { disposition: execution.body.disposition };
  });
  app.get("/health/bounds", { preHandler(request, _reply, done) {
    request.auth = { accountId: "synthetic-account", accountSlug: "fixture", userId: "synthetic-user", userEmail: "fixture@example.test", userKind: "simulated_human", sessionId: "synthetic-session" }; done();
  } }, async () => {
    for (let i = 0; i < 18; i++) await measureLabServerStage("context", async () => i);
    return { ok: true };
  });
  await app.ready(); return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe("Lab server diagnostics", () => {
  it("returns bounded matching synthetic stage metadata without request content", async () => {
    const app = await testApp(); const id = "00000000-0000-4000-8000-000000000041";
    const response = await app.inject({ method: "GET", url: "/v1/test?private=do-not-copy", headers: { [LAB_DIAGNOSTIC_REQUEST]: id } });
    const raw = response.headers[LAB_DIAGNOSTIC_RESPONSE] as string;
    expect(raw.length).toBeLessThanOrEqual(4096);
    const value = decode(raw);
    expect(value).toMatchObject({ version: 1, request_id: id, origin: "synthetic_fixture", dropped_spans: 0 });
    expect(value.spans).toEqual([expect.objectContaining({ kind: "context", outcome: "completed" })]);
    expect(JSON.stringify(value)).not.toContain("private"); expect(JSON.stringify(value)).not.toContain("account");
  });
  it("isolates concurrent UUIDs and records failed spans without error text", async () => {
    const app = await testApp(); const one = "00000000-0000-4000-8000-000000000051", two = "00000000-0000-4000-8000-000000000052";
    const [first, second] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/test", headers: { [LAB_DIAGNOSTIC_REQUEST]: one } }),
      app.inject({ method: "GET", url: "/v1/failure", headers: { [LAB_DIAGNOSTIC_REQUEST]: two } }),
    ]);
    expect(decode(first.headers[LAB_DIAGNOSTIC_RESPONSE] as string).request_id).toBe(one);
    const failed = decode(second.headers[LAB_DIAGNOSTIC_RESPONSE] as string);
    expect(failed.request_id).toBe(two); expect(failed.spans).toEqual([expect.objectContaining({ kind: "model_adapter", outcome: "failed" })]);
    expect(JSON.stringify(failed)).not.toContain("provider-error");
  });
  it("does not return metadata before authentication and permits read-only health", async () => {
    const app = await testApp(); const id = "00000000-0000-4000-8000-000000000061";
    const unscoped = await app.inject({ method: "GET", url: "/v1/unscoped", headers: { [LAB_DIAGNOSTIC_REQUEST]: id } });
    expect(unscoped.headers[LAB_DIAGNOSTIC_RESPONSE]).toBeUndefined();
    const health = await app.inject({ method: "GET", url: "/health/live", headers: { [LAB_DIAGNOSTIC_REQUEST]: id } });
    expect(decode(health.headers[LAB_DIAGNOSTIC_RESPONSE] as string)).toMatchObject({ request_id: id, spans: [] });
  });
  it("measures the real unscoped product adapter and bounds stage retention", async () => {
    const app = await testApp(); const id = "00000000-0000-4000-8000-000000000065";
    const result = await app.inject({ method: "GET", url: "/health/ready", headers: { [LAB_DIAGNOSTIC_REQUEST]: id } });
    const trace = decode(result.headers[LAB_DIAGNOSTIC_RESPONSE] as string);
    expect(trace.spans).toEqual([expect.objectContaining({ kind: "model_adapter", outcome: "completed" })]);
    expect(JSON.stringify(trace)).not.toContain("private");
    const bounded = await app.inject({ method: "GET", url: "/health/bounds", headers: { [LAB_DIAGNOSTIC_REQUEST]: id } });
    expect(decode(bounded.headers[LAB_DIAGNOSTIC_RESPONSE] as string)).toMatchObject({ dropped_spans: 2, spans: expect.any(Array) });
    expect((decode(bounded.headers[LAB_DIAGNOSTIC_RESPONSE] as string).spans as unknown[]).length).toBe(16);
    const invalid = await app.inject({ method: "GET", url: "/health/ready", headers: { [LAB_DIAGNOSTIC_REQUEST]: "invalid" } });
    expect(invalid.headers[LAB_DIAGNOSTIC_RESPONSE]).toBeUndefined();
  });
  it("is absent when the internal capability is disabled or the UUID is invalid", async () => {
    const app = await testApp(false);
    for (const value of ["bad", "00000000-0000-4000-8000-000000000071"]) {
      const response = await app.inject({ method: "GET", url: "/v1/test", headers: { [LAB_DIAGNOSTIC_REQUEST]: value } });
      expect(response.headers[LAB_DIAGNOSTIC_RESPONSE]).toBeUndefined();
    }
  });
});
