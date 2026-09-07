import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { digestCanonicalJson } from "@talent-signal/evaluation";
import { afterEach, describe, expect, it } from "vitest";
import type { RunEvaluationCaseOutputV1 } from "../runSuite.js";

const exec = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directories: string[] = [];
const servers: Server[] = [];
type Row = Record<string, any>;

async function fixture(initial: "missing" | "auth" | "ready" = "missing") {
  let state: string = initial;
  let datasetDigest = `sha256:${"b".repeat(64)}`;
  const traces = new Map<string, Row>();
  const spans = new Map<string, Row>();
  const experiments = new Map<string, Row>();
  const links = new Map<string, Row>();
  const requests: string[] = [];
  const unexpected: string[] = [];
  let spanBlock: { started(): void; wait: Promise<void> } | undefined;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://fixture").pathname.replace(/^\/api\/v1\/private/, "");
    const route = `${req.method} ${path}`;
    requests.push(route);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as Row : {};
    const json = (value: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    const stream = (values: Row[]) => { res.writeHead(200, { "content-type": "application/x-ndjson" }); res.end(values.map((row) => JSON.stringify(row)).join("\n") + "\n"); };
    if (state === "auth") return json({ message: "synthetic authentication rejection" }, 401);
    if (route === "POST /datasets/retrieve") return state === "missing" ? json({}, 404) : json({ id: "dataset-1", name: "get13-dataset" });
    if (route === "POST /datasets/items/stream") return stream([{ id: "item-1", data: { dataset_digest: datasetDigest } }]);
    if (route === "GET /datasets/dataset-1/versions") return json({ content: [{ id: "version-1", version_name: "v1" }] });
    if (route === "POST /traces/batch") { for (const row of body.traces) traces.set(row.id, row); return json({}, 204); }
    if (route === "POST /spans/batch") {
      if (state === "drop-spans") return json({}, 503);
      if (spanBlock) { spanBlock.started(); await spanBlock.wait; }
      for (const row of body.spans) spans.set(row.id, row);
      return json({}, 204);
    }
    if (route === "POST /experiments/stream") return stream([...experiments.values()].filter((row) => row.name === body.name));
    if (route === "POST /experiments") { experiments.set(body.id, body); return json({}, 204); }
    if (route === "POST /experiments/items") { for (const row of body.experiment_items) links.set(row.id, row); return json({}, 204); }
    if (route === "POST /experiments/items/stream") {
      if (body.project_name !== "get13-test") return json({}, 400);
      return stream(body.last_retrieved_id ? [] : [...links.values()]);
    }
    if (route === "POST /experiments/items/delete") { for (const id of body.ids) links.delete(id); return json({}, 204); }
    if (route === "PUT /traces/feedback-scores") {
      for (const row of body.scores) {
        const trace = traces.get(row.id)!;
        const scores: Row[] = trace.feedback_scores ?? [];
        trace.feedback_scores = [...scores.filter((score) => score.name !== row.name), row];
      }
      return json({}, 204);
    }
    const entity = path.match(/^\/(traces|spans|experiments)\/([^/]+)$/);
    if (entity) {
      const map = entity[1] === "traces" ? traces : entity[1] === "spans" ? spans : experiments;
      const row = map.get(entity[2]!);
      if (!row) return json({}, 404);
      if (req.method === "DELETE") { map.delete(entity[2]!); return json({}, 204); }
      if (req.method === "PATCH") { Object.assign(row, body); return json({}, 204); }
      if (req.method === "GET") return json(row);
    }
    unexpected.push(route);
    return json({ message: `Unsupported synthetic fixture route ${route}` }, 400);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/api`, requests, unexpected, traces, spans, experiments, links,
    setState: (value: string) => { state = value; }, setDigest: (value: string) => { datasetDigest = value; },
    pauseSpans: () => {
      let started!: () => void; let release!: () => void;
      const reached = new Promise<void>((resolve) => { started = resolve; });
      const wait = new Promise<void>((resolve) => { release = resolve; });
      spanBlock = { started, wait };
      return { reached, release };
    } };
}

async function artifacts() { const path = await mkdtemp(join(tmpdir(), "get13-cli-")); directories.push(path); return path; }

async function cli(args: string[], output: string, url: string) {
  try {
    const result = await exec(process.execPath, [join(packageRoot, "node_modules/tsx/dist/cli.mjs"), join(packageRoot, "src/cli.ts"),
      ...args, "--artifact-dir", output], {
      cwd: packageRoot,
      env: { PATH: process.env.PATH!, GIT_SHA: "abcdef1234567890", OPIK_URL_OVERRIDE: url,
        OPIK_PROJECT_NAME: "get13-test", OPIK_API_KEY: "synthetic-fixture-key", OPIK_WORKSPACE: "default", OPIK_LOG_LEVEL: "ERROR" },
      timeout: 25_000, maxBuffer: 2_000_000,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

const replay = ["replay", "--id", "TS-ACT-101", "--opik", "--owner-controlled", "--dataset", "get13-dataset",
  "--agent-definition-id", "get13-test", "--agent-definition-version", "v1",
  "--agent-definition-digest", `sha256:${"a".repeat(64)}`];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("real CLI local-first Opik projection", () => {
  it("retains failure when SDK flush swallows dropped spans, then recovers without duplicate identity", async () => {
    const remote = await fixture(); const output = await artifacts();
    const initial = await cli(replay, output, remote.url);
    const run = JSON.parse(initial.stdout) as RunEvaluationCaseOutputV1;
    const envelope = JSON.parse(await readFile(join(output, "projection-ledger", `opik_${run.manifest.runId}`, "envelope.json"), "utf8"));
    remote.setDigest(envelope.datasetDigest); remote.setState("drop-spans");
    const args = ["opik-export", "--run-id", run.manifest.runId, "--root", "/intentionally-missing-repository"];
    const dropped = await cli(args, output, remote.url);
    expect(dropped.code).toBe(1);
    expect(JSON.parse(dropped.stdout)).toMatchObject({ newModelCalls: 0, receipt: { status: "failed" } });
    remote.setState("ready");
    const [first, second] = await Promise.all([cli(args, output, remote.url), cli(args, output, remote.url)]);
    expect(first.code, first.stderr).toBe(0); expect(second.code, second.stderr).toBe(0);
    expect([JSON.parse(first.stdout).reusedCompletion, JSON.parse(second.stdout).reusedCompletion].sort()).toEqual([false, true]);
    expect(remote.traces.size).toBe(1); expect(remote.experiments.size).toBe(1); expect(remote.links.size).toBe(1);
  }, 60_000);

  it("serializes deletion after in-flight export and refuses a late resurrection", async () => {
    const remote = await fixture(); const output = await artifacts();
    const initial = await cli(replay, output, remote.url);
    const run = JSON.parse(initial.stdout) as RunEvaluationCaseOutputV1;
    const directory = join(output, "projection-ledger", `opik_${run.manifest.runId}`);
    const envelope = JSON.parse(await readFile(join(directory, "envelope.json"), "utf8"));
    remote.setDigest(envelope.datasetDigest); remote.setState("ready");
    const pause = remote.pauseSpans();
    const args = ["opik-export", "--run-id", run.manifest.runId, "--root", "/intentionally-missing-repository"];
    const exporting = cli(args, output, remote.url);
    await pause.reached;
    const deleting = cli(["opik-delete", "--projection-id", `opik:${run.manifest.runId}`], output, remote.url);
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await readdir(directory)).includes("deletion_requested.json")) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    expect(await readdir(directory)).toContain("deletion_requested.json");
    pause.release();
    expect((await exporting).code).toBe(0);
    const deleted = await deleting;
    expect(JSON.parse(deleted.stdout)).toMatchObject({ status: "deleted", readBackVerified: true });
    expect(remote.traces.size).toBe(0); expect(remote.links.size).toBe(0);
    const requests = remote.requests.length;
    const late = await cli(args, output, remote.url);
    expect(late.code).toBe(1); expect(late.stderr).toContain("OPIK_RETRY_DELETED_PROJECTION");
    expect(remote.requests.length).toBe(requests);
  }, 60_000);

  it.each([
    ["unavailable", "OPIK_UNAVAILABLE"], ["auth", "OPIK_AUTHENTICATION_FAILED"],
    ["missing", "OPIK_DATASET_NOT_SYNCED"], ["conflict", "OPIK_DATASET_DIGEST_CONFLICT"],
  ] as const)("preserves immutable local completion when projection is %s", async (state, reason) => {
    const remote = await fixture(state === "auth" ? "auth" : state === "missing" ? "missing" : "ready");
    if (state === "unavailable") await new Promise<void>((resolve) => remote && servers.at(-1)!.close(() => resolve()));
    const output = await artifacts();
    const result = await cli(replay, output, remote.url);
    expect(result.stdout, result.stderr).toContain('"manifest"');
    const run = JSON.parse(result.stdout) as RunEvaluationCaseOutputV1;
    expect(result.code).toBe(["fail", "not_run"].includes(run.gate.status) ? 1 : 0);
    expect(run.localReceipt.status).toBe("succeeded");
    expect(run.projectionReceipts[0], JSON.stringify(run.projectionErrors)).toMatchObject({ status: "failed", reasonCode: reason });
    const runDir = join(output, "runs", run.manifest.runId);
    const completion = JSON.parse(await readFile(join(runDir, "completion.json"), "utf8"));
    const artifact = JSON.parse(await readFile(join(runDir, `run-artifact.${completion.artifactDigest.slice(7)}.json`), "utf8"));
    expect(digestCanonicalJson(artifact)).toBe(completion.artifactDigest);
    expect(artifact.manifest.contentDigest).toBe(run.manifest.contentDigest);
    expect(remote.traces.size).toBe(0);
    expect(remote.experiments.size).toBe(0);
  }, 30_000);

  it("retries the same immutable completion after recovery without repository/model execution or duplicate records", async () => {
    const remote = await fixture();
    const output = await artifacts();
    const initial = await cli(replay, output, remote.url);
    expect(initial.stdout, initial.stderr).toContain('"manifest"');
    const run = JSON.parse(initial.stdout) as RunEvaluationCaseOutputV1;
    const ledgerDir = join(output, "projection-ledger", `opik_${run.manifest.runId}`);
    const envelope = JSON.parse(await readFile(join(ledgerDir, "envelope.json"), "utf8"));
    const before = await readdir(join(output, "runs", run.manifest.runId));
    remote.setState("ready"); remote.setDigest(envelope.datasetDigest);
    const retryArgs = ["opik-export", "--run-id", run.manifest.runId, "--root", "/intentionally-missing-repository"];
    const retried = await cli(retryArgs, output, remote.url);
    expect(retried.code, `${retried.stderr}\n${retried.stdout}\n${remote.requests.join("\n")}`).toBe(0);
    expect(JSON.parse(retried.stdout)).toMatchObject({ newModelCalls: 0, receipt: { status: "succeeded", localArtifactDigest: run.localReceipt.localArtifactDigest } });
    expect(remote.unexpected).toEqual([]);
    const writes = remote.requests.length;
    const again = await cli(retryArgs, output, remote.url);
    expect(again.code, again.stderr).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({ newModelCalls: 0, reusedCompletion: true });
    expect(remote.requests.length).toBe(writes);
    expect(remote.traces.size).toBe(1); expect(remote.experiments.size).toBe(1); expect(remote.links.size).toBe(1);
    expect(await readdir(join(output, "runs", run.manifest.runId))).toEqual(before);
    const completionPath = join(output, "runs", run.manifest.runId, "completion.json");
    const completion = JSON.parse(await readFile(completionPath, "utf8"));
    await writeFile(completionPath, JSON.stringify({ ...completion, artifactDigest: `sha256:${"f".repeat(64)}` }));
    const tampered = await cli(retryArgs, output, remote.url);
    expect(tampered.code).toBe(1); expect(tampered.stderr).toContain("OPIK_RETRY_LOCAL_ARTIFACT_MISMATCH");
    expect(remote.requests.length).toBe(writes);
  }, 60_000);
});
