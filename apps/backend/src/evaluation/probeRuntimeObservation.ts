import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { access, constants } from "node:fs/promises";
import { createEnvironmentRuntimeObserver } from "@talent-signal/agent";

export async function probeRuntimeObservation(environment: NodeJS.ProcessEnv = process.env) {
const root = environment.TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX?.trim();
if (!root) throw new Error("RUNTIME_OBSERVATION_OUTBOX_REQUIRED");
// A transport probe has no database source validator and must never scan the
// native product queue. This directory still lives on the durable volume.
const observer = createEnvironmentRuntimeObserver({ ...environment, TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX: join(root, "deployment-probes") });
if (!observer) throw new Error("PRODUCT_OBSERVATION_POLICY_REQUIRED");
const policy = observer.outbox.policy;
if (!policy.authorization_scopes.includes("product_run")) throw new Error("PRODUCT_OBSERVATION_PROJECTION_REQUIRED");
const context = { run_id: `deployment-probe:${randomUUID()}`, workspace_id: policy.source_workspace_ids[0]!,
  authorization_scope: policy.authorization_scopes[0]!, source_refs: { kind: "synthetic" as const } };
try {
  const response = await fetch(`${policy.endpoint}/is-alive/ver`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("PRODUCT_OBSERVATION_ENDPOINT_UNAVAILABLE");
  const session = observer.start(context, { synthetic: true, purpose: "deployment-observation-probe" });
  if (!session) throw new Error("PRODUCT_OBSERVATION_SCOPE_DENIED");
  // No model is invoked. Destination readback is performed by the concrete transport.
  await session.complete({ synthetic: true, result: "transport-only" }, "ok");
  // Opik indexes writes asynchronously; require bounded destination readback,
  // rather than assuming a successful POST is immediately queryable.
  const deadline = Date.now() + 40_000;
  let retained = false;
  do {
    await observer.outbox.flush();
    retained = (await observer.outbox.status()).receipts.some(r => r.trace_id === session.id && r.state === "retained");
    if (!retained) await new Promise(resolve => setTimeout(resolve, 500));
  } while (!retained && Date.now() < deadline);
  if (!retained) throw new Error("PRODUCT_OBSERVATION_READBACK_REQUIRED");
  await access(join(root, "deployment-probes"), constants.W_OK);
  await observer.outbox.deleteRun(context);
  const deleteDeadline = Date.now() + 40_000;
  let deleted = false;
  do {
    await observer.outbox.flush();
    deleted = (await observer.outbox.status()).receipts.some(r => r.trace_id === session.id && r.state === "deleted");
    if (!deleted) await new Promise(resolve => setTimeout(resolve, 500));
  } while (!deleted && Date.now() < deleteDeadline);
  if (!deleted) throw new Error("PRODUCT_OBSERVATION_DELETE_READBACK_REQUIRED");
  return { status: "verified", endpoint: policy.endpoint, project: policy.project,
    synthetic_only: true, model_calls: 0, persistent_write: true, destination_readback: true, deletion_readback: true };
} finally { observer.dispose(); }

}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(await probeRuntimeObservation()));
}
