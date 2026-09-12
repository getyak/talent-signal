import { mkdtemp, stat, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { PrivateOpikRuntimeTransport } from "@talent-signal/agent";
import { probeRuntimeObservation } from "./probeRuntimeObservation.js";

afterEach(() => vi.restoreAllMocks());
it("never scans an existing product queue while verifying synthetic transport on its durable volume", async () => {
  const root = await mkdtemp(join(tmpdir(), "observation-probe-test-"));
  // Any read of this existing native entry by flush would fail JSON parsing.
  // An isolated probe must leave all native entries entirely untouched.
  const existing = join(root, "10000000-0000-7000-a000-000000000001.json");
  await writeFile(existing, "native queue sentinel: do not read or rewrite");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ version: "synthetic" }));
  vi.spyOn(PrivateOpikRuntimeTransport.prototype, "retain").mockResolvedValue(undefined);
  vi.spyOn(PrivateOpikRuntimeTransport.prototype, "remove").mockResolvedValue(undefined);
  try {
    const result = await probeRuntimeObservation({ TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX: root,
      TALENT_SIGNAL_OPIK_RUNTIME_POLICY: JSON.stringify({ version: "private_full_content.v1", mode: "private_full_content",
        endpoint: "http://opik-frontend:5173/api", workspace: "default", project: "synthetic-probe", source_workspace_ids: ["synthetic"],
        authorization_scopes: ["product_run"], retention_days: 1, max_content_bytes: 2000 }) });
    expect(result).toMatchObject({ status: "verified", destination_readback: true, deletion_readback: true, model_calls: 0 });
    expect(await readFile(existing, "utf8")).toBe("native queue sentinel: do not read or rewrite");
    expect((await stat(join(root, "deployment-probes"))).isDirectory()).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
