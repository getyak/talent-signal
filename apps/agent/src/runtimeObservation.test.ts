import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir, hostname } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { ZhipuChatAnswerProvider } from "./chatAnswerProvider.js";
import { RuntimeObservationPolicySchema, RuntimeObservationSchema, RuntimeObservationSession, captureObservationContent, observationHash, observationID,
  type RuntimeObservation, type RuntimeObservationPolicy } from "./runtimeObservation.js";
import { RuntimeObservationOutbox, RuntimeObserver, PrivateOpikRuntimeTransport, createEnvironmentRuntimeObserver,
  type RuntimeObservationTransport } from "./runtimeObservationOutbox.js";
const policy: RuntimeObservationPolicy = {
  version: "private_full_content.v1", mode: "private_full_content", endpoint: "http://localhost:5173/api",
  workspace: "default", project: "get11-runtime-test", source_workspace_ids: ["workspace-test"],
  authorization_scopes: ["relationship_text", "workspace_conversation"], retention_days: 1, max_content_bytes: 1024 * 1024,
};
const context = { run_id: "run-test", workspace_id: "workspace-test", authorization_scope: "relationship_text", source_refs: { kind: "synthetic" as const } };
async function observation(): Promise<RuntimeObservation> {
  let value: RuntimeObservation | undefined;
  const session = new RuntimeObservationSession(policy, context, { objective: "synthetic input" }, { enqueue: async (result) => { value = result; } });
  await session.step("model", "llm", { content: "synthetic message" }, async () => ({ content: "synthetic answer" }));
  await session.complete({ answer: "synthetic answer" }, "ok");
  return value!;
}
async function setup(transport: RuntimeObservationTransport = { retain: async () => {}, remove: async () => {} }) {
  const root = await mkdtemp(join(tmpdir(), "runtime-observation-"));
  return { root, outbox: new RuntimeObservationOutbox(root, policy, transport) };
}
describe("private runtime observation", () => {
  it("is disabled by default and rejects cloud, redirect-shaped, and out-of-scope destinations", () => {
    expect(createEnvironmentRuntimeObserver({})).toBeNull();
    expect(RuntimeObservationPolicySchema.safeParse({ ...policy, endpoint: "http://host.docker.internal:5173/api" }).success).toBe(true);
    for (const endpoint of ["https://www.comet.com/opik/api", "http://localhost:5173/api?forward=cloud", "http://user:secret@localhost:5173/api", "http://internal.example/api", "http://host.docker.internal.example/api"]) {
      expect(RuntimeObservationPolicySchema.safeParse({ ...policy, endpoint }).success).toBe(false);
    }
    expect(() => new RuntimeObservationSession(policy, { ...context, workspace_id: "another-account" }, {}, { enqueue: async () => {} })).toThrow("SCOPE_DENIED");
  });
  it("retains authorized business content but removes credentials and marks omitted media explicitly", () => {
    const value = captureObservationContent({ text: "salary discussion", api_key: "credential", nested: { authorization: "Bearer hidden" }, output: "known-api-key" }, 1024, ["known-api-key"]);
    expect(value.status).toBe("redacted");
    expect(JSON.stringify(value)).toContain("salary discussion");
    expect(JSON.stringify(value)).not.toContain("known-api-key");
    expect(JSON.stringify(value)).not.toContain('"credential"');
    const media = captureObservationContent({ image: "x".repeat(2000) }, 1024);
    expect(media).toMatchObject({ status: "truncated", retained_bytes: 0 });
    expect(media.value).toBeUndefined();
  });
  it("does not capture a product request without host-owned source lineage", async () => {
    const { outbox } = await setup(); const observer = new RuntimeObserver(outbox);
    expect(observer.start({ run_id: context.run_id, workspace_id: context.workspace_id,
      authorization_scope: context.authorization_scope }, { raw: "must not persist" })).toBeNull();
    expect(observer.last_error_code).toBe("RUNTIME_OBSERVATION_SOURCE_LINEAGE_REQUIRED");
    expect(await outbox.sourceRuns()).toEqual([]);
  });
  it("tombstones a source revoked during export instead of retaining a stale body", async () => {
    let available = true;
    const retain = vi.fn(async () => { available = false; }), remove = vi.fn();
    const { root, outbox } = await setup({ retain, remove });
    outbox.setSourceValidator(async () => available);
    const session = new RuntimeObservationSession(policy, { ...context, source_session_id: "session-test", source_refs: {
      kind: "product", capture_ids: [], fragment_ids: [], media_ids: [], person_ids: [], relationship_context_ids: [],
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    } }, { text: "synthetic revocable content" }, outbox);
    await session.complete({ text: "synthetic derived output" }, "ok"); await outbox.flush();
    expect((await outbox.status()).deletion_pending).toBe(1);
    expect(await readFile(join(root, `${session.id}.json`), "utf8")).not.toContain("synthetic revocable content");
    await outbox.flush(); expect((await outbox.status()).deleted).toBe(1);
    expect(retain).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce();
  });
  it("revalidates retained sources during the background flush without another product request", async () => {
    let available = true;
    const remove = vi.fn(); const { outbox } = await setup({ retain: async () => {}, remove });
    outbox.setSourceValidator(async () => available);
    const session = new RuntimeObservationSession(policy, { ...context, source_regression_id: "10000000-0000-4000-8000-000000000001",
      source_refs: { kind: "product", capture_ids: [], fragment_ids: [], media_ids: [], person_ids: [], relationship_context_ids: [],
        expires_at: new Date(Date.now() + 60_000).toISOString() } }, { text: "synthetic source" }, outbox);
    await session.complete({ answer: "synthetic output" }, "ok"); await outbox.flush();
    expect((await outbox.status()).retained).toBe(1);
    available = false; await outbox.flush();
    expect((await outbox.status()).deleted).toBe(1); expect(remove).toHaveBeenCalledOnce();
  });
  it("records actual model turns, rejected tools and successful retry as child spans with nullable cost", async () => {
    const { outbox } = await setup(); const observer = new RuntimeObserver(outbox);
    const bodies: Record<string, unknown>[] = [];
    let turn = 0;
    const provider = new ZhipuChatAnswerProvider({ apiKey: "synthetic-key", model: "glm-5.3", observer,
      fetcher: vi.fn(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>); turn++;
        return Response.json({ id: `response-${turn}`, model: "glm-5.3",
          choices: [{ message: turn < 3 ? { content: null, tool_calls: [{ id: `call-${turn}`, type: "function",
            function: { name: "contact_workspace_search", arguments: JSON.stringify({ query: "synthetic person", maximum_results: 4 }) } }] }
            : { content: JSON.stringify({ outcome: "answer", title: "Done", body: "synthetic answer" }) } }],
          ...(turn === 1 ? { usage: { prompt_tokens: 10, completion_tokens: 4 } } : {}) });
      }) as typeof fetch });
    let calls = 0;
    await provider.run({ runID: "run-tool-retry", objective: "Review the available workspace context",
      observation: { ...context, run_id: "run-tool-retry", authorization_scope: "workspace_conversation" },
      systemPrompt: "Synthetic system", scopeSummary: { kind: "workspace_conversation", workspaceID: "workspace-test", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: ["contact_workspace"], budget: { maxTurns: 4, maxToolCalls: 4, maxDurationMs: 30000, maxTaskTokens: 1000, maxEstimatedUsd: 1 } },
      async (name) => { calls++; return calls === 1 ? { ok: false, callID: "tool-failure", name, error: { code: "TEMPORARY", message: "synthetic failure" } }
        : { ok: true, callID: "tool-success", name, data: { operation: "search", results: [] } }; }, AbortSignal.timeout(5000));
    await outbox.flush();
    await vi.waitFor(async () => expect((await outbox.status()).retained).toBe(1));
    const states = await outbox.status();
    const retained = states.receipts[0]!;
    // Complete() triggers asynchronous export; a concurrent inspection may see pending.
    expect(retained.content_states.complete).toBeGreaterThan(0);
    const entries = await readdir((outbox as unknown as { root: string }).root);
    const data = JSON.parse(await readFile(join((outbox as unknown as { root: string }).root, entries.find((name) => name.endsWith(".json"))!), "utf8")) as { observation: RuntimeObservation };
    const spans = data.observation.spans;
    const models = spans.filter((span) => span.kind === "llm"), tools = spans.filter((span) => span.kind === "tool");
    expect(models).toHaveLength(3); expect(tools).toHaveLength(2);
    expect(models[0]?.input.value).toEqual(bodies[0]);
    expect(models[0]?.usage).toMatchObject({ input_tokens: 10, output_tokens: 4, source: "provider", cost_usd: null, accounting: "leaf" });
    expect(models[1]?.usage).toMatchObject({ input_tokens: null, output_tokens: null, source: "unavailable" });
    expect(tools[0]?.status).toBe("error"); expect(tools[1]?.retry_of).toBe(tools[0]?.id);
    expect(tools[0]?.parent_span_id).toBe(models[0]?.id); expect(tools[1]?.parent_span_id).toBe(models[1]?.id);
    expect(spans[0]?.usage.accounting).toBe("none");
    expect(JSON.stringify(data)).not.toContain("synthetic-key");
  });
  it("persists before export, retries with stable ids after restart, and reports actual backlog", async () => {
    const retain = vi.fn().mockRejectedValueOnce(new Error("network secret payload")).mockResolvedValue(undefined);
    const { root, outbox } = await setup({ retain, remove: async () => {} });
    const value = await observation(); await outbox.enqueue(value); await outbox.flush();
    expect((await outbox.status()).pending).toBe(1);
    expect(JSON.stringify(await outbox.status())).not.toContain("network secret payload");
    const restarted = new RuntimeObservationOutbox(root, policy, { retain, remove: async () => {} });
    await restarted.flush(); expect((await restarted.status()).retained).toBe(1);
    expect(retain.mock.calls[0]?.[0].spans.map((span: { id: string }) => span.id)).toEqual(retain.mock.calls[1]?.[0].spans.map((span: { id: string }) => span.id));
  });
  it("spools completion durably while another process holds the export lock", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    await writeFile(join(root, `${value.id}.json.lock`), JSON.stringify({ pid: process.pid, namespace: hostname() }));
    await outbox.enqueue(value);
    expect((await outbox.status()).spooled).toBe(1);
    expect((await outbox.status()).locks).toBe(1);
  });
  it("recovers an exited exporter and resumes its durable queue", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    await writeFile(join(root, `${value.id}.json.lock`), JSON.stringify({ pid: 2147483647, namespace: hostname() }));
    await outbox.enqueue(value); await outbox.flush();
    expect((await outbox.status()).retained).toBe(1);
  });
  it("recovers pre-protocol empty locks and crashed recovery claims", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    await outbox.enqueue(value);
    const lock = join(root, `${value.id}.json.lock`);
    await writeFile(lock, "");
    await writeFile(join(root, `recovery-${observationHash([lock, ""])}.lock`), JSON.stringify({ pid: 2147483647, namespace: hostname() }));
    await outbox.flush();
    expect((await outbox.status()).retained).toBe(1);
    expect((await outbox.status()).locks).toBe(0);
  });
  it("never displaces a lock from another process namespace or an unproven legacy owner", async () => {
    const { root, outbox } = await setup(); const value = await observation(); await outbox.enqueue(value);
    for (const namespace of ["foreign-container", undefined]) {
      await writeFile(join(root, `${value.id}.json.lock`), JSON.stringify({ pid: 2147483647, namespace }));
      await outbox.flush();
      expect((await outbox.status()).spooled).toBe(1);
      expect((await outbox.status()).retained).toBe(0);
    }
  });
  it("keeps attempts independent above 500 total spans and deletes every retained span", async () => {
    const retain = vi.fn(), remove = vi.fn(); const { outbox } = await setup({ retain, remove });
    const first = await observation(), second = await observation();
    for (const item of [first, second]) {
      const leaf = item.spans[1]!;
      item.spans.push(...Array.from({ length: 249 }, (_, i) => ({ ...leaf, id: observationID(`${item.attempt_id}:${i}`) })));
      RuntimeObservationSchema.parse(item); await outbox.enqueue(item);
    }
    await outbox.flush();
    expect(retain).toHaveBeenCalledTimes(2);
    expect((await outbox.status()).receipts[0]?.retained_span_ids).toHaveLength(502);
    await outbox.deleteRun(context);
    expect(remove.mock.calls[0]?.[1]).toHaveLength(502);
    expect((await outbox.status()).deleted).toBe(1);
  });
  it("deletes malformed pending bodies and crash temporary files without merging them", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    await outbox.enqueue(value); await outbox.flush();
    await writeFile(join(root, `${value.id}.broken.pending`), "synthetic private corrupt body");
    await writeFile(join(root, `${value.id}.crash.tmp`), "synthetic private crash body");
    await outbox.deleteRun(context);
    expect((await readdir(root)).some((name) => /\.(?:pending|tmp)$/u.test(name))).toBe(false);
    expect((await outbox.status()).deleted).toBe(1);
  });
  it("cleans temporary bodies when atomic rename fails", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    const original = fs.rename;
    const rename = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to).endsWith(".pending")) throw new Error("synthetic rename failure");
      return original(from, to);
    });
    try { await expect(outbox.enqueue(value)).rejects.toThrow("rename failure"); }
    finally { rename.mockRestore(); }
    expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  it("expires an existing run despite poison pending and continues past another run failure", async () => {
    const { root, outbox } = await setup(); const value = await observation();
    await outbox.enqueue(value); await outbox.flush();
    await writeFile(join(root, `${value.id}.broken.pending`), "corrupt");
    const otherID = observationID("other run");
    await writeFile(join(root, `${otherID}.broken.pending`), "corrupt");
    await expect(outbox.flush(Date.parse(value.retention_expires_at) + 1)).rejects.toThrow();
    expect((await outbox.status()).deleted).toBe(1);
    expect(await readdir(root)).not.toContain(`${value.id}.broken.pending`);
  });
  it("rejects path-shaped attempt identifiers and unbound run identities", async () => {
    const { outbox } = await setup(); const value = await observation();
    await expect(outbox.enqueue({ ...value, attempt_id: "../../../escape" })).rejects.toThrow();
    await expect(outbox.enqueue({ ...value, run_id: "another-run" })).rejects.toThrow();
  });
  it("deletion tombstones remove bodies and prevent late retry or resume resurrection", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const retain = vi.fn().mockResolvedValue(undefined);
    const { root, outbox } = await setup({ retain, remove }); const value = await observation();
    await outbox.enqueue(value); await outbox.flush(); await outbox.deleteRun(context);
    expect((await outbox.status()).deletion_pending).toBe(1);
    const disk = await readFile(join(root, `${value.id}.json`), "utf8");
    expect(disk).not.toContain("synthetic message");
    await expect(outbox.enqueue(value)).rejects.toThrow("DELETED");
    await outbox.flush(); const receipt = (await outbox.status()).receipts[0]!;
    expect(receipt.state).toBe("deleted"); expect(receipt.deleted_span_ids).toHaveLength(value.spans.length);
    expect(receipt.retained_span_ids).toEqual([]); expect(retain).toHaveBeenCalledTimes(1);
    const resumed = new RuntimeObservationOutbox(root, policy, { retain, remove });
    await expect(resumed.enqueue(await observation())).rejects.toThrow("DELETED");
  });
  it("durably records deletion during an active export and prevents stale exporter persistence", async () => {
    let finish!: () => void, started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const finishing = new Promise<void>((resolve) => { finish = resolve; });
    const retain = vi.fn(async () => { started(); await finishing; });
    const remove = vi.fn(); const { root, outbox } = await setup({ retain, remove });
    const value = await observation(); await outbox.enqueue(value);
    const exporting = outbox.flush(); await startedPromise;
    await outbox.deleteRun(context);
    expect((await outbox.status()).deletion_pending).toBe(1);
    await expect(outbox.enqueue(await observation())).rejects.toThrow("DELETED");
    finish(); await exporting; await outbox.flush();
    expect((await outbox.status()).deleted).toBe(1);
    expect(await readFile(join(root, `${value.id}.json`), "utf8")).not.toContain("synthetic message");
    expect(remove).toHaveBeenCalledOnce();
  });
  it("expires local and remote content through the same deletion path", async () => {
    const remove = vi.fn(); const { outbox } = await setup({ retain: async () => {}, remove });
    const value = await observation(); await outbox.enqueue(value);
    await outbox.flush(Date.parse(value.retention_expires_at) + 1);
    expect((await outbox.status()).deleted).toBe(1); expect(remove).toHaveBeenCalledOnce();
  });
  it("never reroutes an old outbox to a different private target", async () => {
    const { root, outbox } = await setup(); const value = await observation(); await outbox.enqueue(value);
    const transport = { retain: vi.fn(), remove: vi.fn() };
    const redirected = new RuntimeObservationOutbox(root, { ...policy, project: "different-project" }, transport);
    await expect(redirected.flush()).rejects.toThrow("TARGET_MISMATCH"); expect(transport.retain).not.toHaveBeenCalled();
  });
  it("requires full trace and child readback before retained receipts, and disables redirects", async () => {
    const value = await observation(); const stored = new Map<string, Record<string, unknown>>();
    const fetcher = vi.fn(async (url, init) => {
      expect(init?.redirect).toBe("error"); expect((init?.headers as Record<string, string>)["Comet-Workspace"]).toBe("default");
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)) as Record<string, unknown>; stored.set(String(body.id), body); return new Response(null, { status: 201 }); }
      const id = String(url).split("/").at(-1)!; return stored.has(id) ? Response.json(stored.get(id)) : new Response(null, { status: 404 });
    }) as typeof fetch;
    const transport = new PrivateOpikRuntimeTransport(policy, "synthetic-opik-key", fetcher);
    await transport.retain(value);
    const corrupted = vi.fn(async (url, init) => {
      const response = await fetcher(url, init);
      if (init?.method === "GET" && String(url).includes("/spans/")) return Response.json({ ...(await response.json()), output: { tampered: true } });
      return response;
    }) as typeof fetch;
    await expect(new PrivateOpikRuntimeTransport(policy, undefined, corrupted).retain(value)).rejects.toThrow("READBACK_MISMATCH");
    const root = stored.get(value.spans[0]!.id)!; expect(root.usage).toBeUndefined();
  });
  it("verifies trace deletion cascades to every known child without using unsupported span deletion", async () => {
    const value = await observation(); let traceDeleted = false, leaveChild = false;
    const requests: Array<{ url: string; method: string | undefined }> = [];
    const fetcher = vi.fn(async (url, init) => {
      requests.push({ url: String(url), method: init?.method });
      if (init?.method === "DELETE") {
        if (String(url).includes("/spans/")) return new Response(null, { status: 501 });
        traceDeleted = true; return new Response(null, { status: 204 });
      }
      if (leaveChild && String(url).includes("/spans/")) return Response.json({ id: value.spans[0]!.id });
      return traceDeleted ? new Response(null, { status: 404 }) : Response.json({ id: value.id });
    }) as typeof fetch;
    const transport = new PrivateOpikRuntimeTransport(policy, undefined, fetcher);
    await transport.remove(value.id, value.spans.map((span) => span.id));
    expect(requests.some(({ url, method }) => url.includes("/spans/") && method === "DELETE")).toBe(false);
    leaveChild = true;
    await expect(transport.remove(value.id, value.spans.map((span) => span.id))).rejects.toThrow("DELETE_UNVERIFIED");
  });
});
