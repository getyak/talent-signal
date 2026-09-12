import { randomUUID } from "node:crypto";
import { access, constants } from "node:fs/promises";
import { createEnvironmentRuntimeObserver } from "@talent-signal/agent";

const observer = createEnvironmentRuntimeObserver();
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
  await access(process.env.TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX!, constants.W_OK);
  await observer.outbox.deleteRun(context);
  if (!(await observer.outbox.status()).receipts.some(r => r.trace_id === session.id && r.state === "deleted")) throw new Error("PRODUCT_OBSERVATION_DELETE_READBACK_REQUIRED");
  console.log(JSON.stringify({ status: "verified", endpoint: policy.endpoint, project: policy.project,
    synthetic_only: true, model_calls: 0, persistent_write: true, destination_readback: true, deletion_readback: true }));
} finally { observer.dispose(); }
