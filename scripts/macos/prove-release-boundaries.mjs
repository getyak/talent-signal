#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
} from "../../packages/contracts/dist/index.js";

const backendRequire = createRequire(
  new URL("../../apps/backend/package.json", import.meta.url),
);
const pg = backendRequire("pg");

const baseURL = process.env.API_BASE_URL ?? "http://127.0.0.1:44317";
const client = new TalentSignalClient(baseURL);

async function scanDatabaseForPrivateResidue(privateSentinel) {
  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL) return null;
  const pool = new pg.Pool({ connectionString: databaseURL, max: 1 });
  try {
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const matchingTables = [];
    let matchingRows = 0;
    for (const { table_name: tableName } of tables.rows) {
      const quotedTable = `"${String(tableName).replaceAll('"', '""')}"`;
      const matches = await pool.query(
        `SELECT count(*)::int AS count
         FROM ${quotedTable} rows
         WHERE position($1 IN to_jsonb(rows)::text) > 0`,
        [privateSentinel],
      );
      const count = matches.rows[0]?.count ?? 0;
      if (count > 0) {
        matchingTables.push({ table_name: tableName, matching_rows: count });
        matchingRows += count;
      }
    }
    return {
      scope: "all_public_base_tables",
      tables_scanned: tables.rows.length,
      matching_tables: matchingTables,
      matching_rows: matchingRows,
    };
  } finally {
    await pool.end();
  }
}

await client.login({
  account_slug: process.env.TS_MACOS_ACCOUNT_SLUG ?? "fixture-alpha",
  user_email: process.env.TS_MACOS_USER_EMAIL ?? "recruiter@alpha.local",
  client_label: "macos-release-boundary-proof",
});

function parseReadbackArguments() {
  const marker = process.argv.indexOf("--readback");
  if (marker < 0) return null;
  const [taskID, runID, resourceID, deletionID, privateSentinel] = process.argv.slice(marker + 1);
  if (![taskID, runID, resourceID, deletionID].every(Boolean)) {
    throw new Error("--readback requires task_id run_id resource_id deletion_id [private_sentinel]");
  }
  return { taskID, runID, resourceID, deletionID, privateSentinel };
}

function parseTTLReadbackArguments() {
  const marker = process.argv.indexOf("--ttl-readback");
  if (marker < 0) return null;
  const [taskID, runID, resourceID, captureID, privateSentinel] = process.argv.slice(marker + 1);
  if (![taskID, runID, resourceID, captureID].every(Boolean)) {
    throw new Error("--ttl-readback requires task_id run_id resource_id capture_id [private_sentinel]");
  }
  return { taskID, runID, resourceID, captureID, privateSentinel };
}

async function unavailableResource(resourceID) {
  try {
    await client.getRelationshipResource(resourceID);
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return { status: error.status, code: error.code };
    }
    throw error;
  }
  throw new Error("Deleted source resource unexpectedly remained readable.");
}

async function governedResourceReadback(resourceID) {
  try {
    const response = await client.getRelationshipResource(resourceID);
    return {
      status: 200,
      authorization_state: response.resource.source_authorization_state,
      source_locator: response.resource.source_locator,
      fragments: response.fragments,
      claim_proposals: response.claim_proposals,
    };
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return { status: error.status, code: error.code };
    }
    throw error;
  }
}

async function readback({ taskID, runID, resourceID, deletionID, privateSentinel }) {
  const [task, run, lineage, resource] = await Promise.all([
    client.getAgentTask(taskID),
    client.getAgentRun(runID),
    client.getDeletionLineage(deletionID),
    unavailableResource(resourceID),
  ]);
  const events = await client.getAgentTaskEvents(taskID, 0);
  const result = {
    observed_at: new Date().toISOString(),
    task: {
      id: task.task.id,
      status: task.task.status,
      task_revision: task.task.task_revision,
      objective: task.task.objective,
      artifact_status: task.task.artifact?.status ?? null,
      artifact_summary: task.task.artifact?.summary ?? null,
      decision_bundle_status: task.task.decision_bundle?.status ?? null,
      external_effects: task.task.external_effects,
    },
    run: {
      id: run.run.id,
      objective: run.run.objective,
      context_evidence: run.run.context_manifest.evidence,
      input_artifacts: run.run.context_manifest.input_artifacts ?? [],
      external_effects: run.run.external_effects,
    },
    task_events: events.events.map((event) => ({
      name: event.name,
      public_payload: event.public_payload,
    })),
    source_resource: resource,
    deletion: {
      id: lineage.deletion_id,
      completed_at: lineage.completed_at,
      lineage_count: lineage.lineage.length,
      lineage: lineage.lineage,
    },
  };
  if (privateSentinel && JSON.stringify(result).includes(privateSentinel)) {
    throw new Error("Private sentinel remained in a post-deletion supported readback.");
  }
  return {
    ...result,
    database_residue_scan: privateSentinel
      ? await scanDatabaseForPrivateResidue(privateSentinel)
      : null,
  };
}

async function ttlReadback({ taskID, runID, resourceID, captureID, privateSentinel }) {
  // The receipt read is the deterministic enforcement boundary. Resolve it
  // before projecting any derivative so one proof can never mix pre-purge
  // and post-purge rows from concurrent requests.
  const retention = await client.getSourceRetentionReceipt(captureID);
  const [task, run, resource] = await Promise.all([
    client.getAgentTask(taskID),
    client.getAgentRun(runID),
    governedResourceReadback(resourceID),
  ]);
  const events = await client.getAgentTaskEvents(taskID, 0);
  const result = {
    observed_at: new Date().toISOString(),
    task: {
      id: task.task.id,
      status: task.task.status,
      task_revision: task.task.task_revision,
      objective: task.task.objective,
      artifact_status: task.task.artifact?.status ?? null,
      artifact_summary: task.task.artifact?.summary ?? null,
      decision_bundle_status: task.task.decision_bundle?.status ?? null,
      external_effects: task.task.external_effects,
    },
    run: {
      id: run.run.id,
      objective: run.run.objective,
      context_evidence: run.run.context_manifest.evidence,
      input_artifacts: run.run.context_manifest.input_artifacts ?? [],
      external_effects: run.run.external_effects,
    },
    task_events: events.events.map((event) => ({
      name: event.name,
      public_payload: event.public_payload,
    })),
    source_resource: resource,
    retention: {
      capture_id: retention.capture_id,
      source_access: retention.source_access,
      source_authorization: retention.source_authorization,
      lifecycle: retention.lifecycle,
      lineage: retention.lineage,
      derivative_lineage: retention.derivative_lineage,
    },
  };
  if (privateSentinel && JSON.stringify(result).includes(privateSentinel)) {
    throw new Error("Private sentinel remained in a post-TTL supported readback.");
  }
  return {
    ...result,
    database_residue_scan: privateSentinel
      ? await scanDatabaseForPrivateResidue(privateSentinel)
      : null,
  };
}

const readbackArguments = parseReadbackArguments();
if (readbackArguments) {
  process.stdout.write(`${JSON.stringify(await readback(readbackArguments), null, 2)}\n`);
  process.exit(0);
}

const ttlReadbackArguments = parseTTLReadbackArguments();
if (ttlReadbackArguments) {
  process.stdout.write(`${JSON.stringify(await ttlReadback(ttlReadbackArguments), null, 2)}\n`);
  process.exit(0);
}

const runID = randomUUID();
const observedAt = new Date().toISOString();
const ttlExpiryMode = process.argv.includes("--ttl-expiry");
const expiresAt = new Date(
  Date.now() + (ttlExpiryMode ? 3_000 : 60 * 60 * 1_000),
).toISOString();
const privateSentinel = `PRIVATE_MACOS_RELEASE_BOUNDARY_${runID}`;
const clientResourceID = `macos-release-boundary:${runID}`;
const capture = await client.createResourceCapture({
  contract_version: CONTRACT_VERSION,
  idempotency_key: `macos-release-boundary:${runID}:capture`,
  channel: "chat",
  purpose: "Synthetic Mac Context Capsule deletion and immutable-manifest proof",
  captured_at: observedAt,
  source_timezone: "Asia/Shanghai",
  person_scope: {
    status: "new_person",
    display_label: `Synthetic macOS boundary ${runID.slice(0, 8)}`,
    relationship_context: {
      status: "proposed",
      label: "Synthetic macOS release relationship",
      purpose: "Verify registered derivative accounting",
      role: "Candidate",
    },
    binding_basis: "The deterministic evaluator explicitly created this synthetic person and context.",
  },
  resource: {
    client_resource_id: clientResourceID,
    kind: "conversation_transcript",
    display_name: "Mac Context Capsule selected text",
    media_type: "text/plain",
    observed_at: observedAt,
    source_timezone: "Asia/Shanghai",
    source_locator: `synthetic:macos-release-boundary:${runID}`,
    authorization_expires_at: expiresAt,
    retention: {
      requested_mode: "evidence_crop",
      source_scope: "reviewed_selected_text",
      requested_retention_until: expiresAt,
    },
  },
  fragments: [
    {
      client_resource_id: clientResourceID,
      kind: "message",
      sequence: 0,
      text: `${privateSentinel}: the candidate needs the exact written policy before Wednesday.`,
      locator: {
        kind: "message",
        source_message_id: `${runID}:message:0`,
        sequence: 0,
        speaker_side: "unknown",
      },
      attribution: { actor_kind: "candidate", status: "confirmed" },
      review_status: "reviewed",
      parser: { name: "talent-signal-macos-context-capsule", version: "1.0.0" },
    },
  ],
});
if (!capture.identity.person_id || !capture.identity.relationship_context_id) {
  throw new Error("Synthetic Mac capture did not bind its isolated test identity.");
}
const resource = await client.getRelationshipResource(capture.resource.id);
const fragment = resource.fragments[0];
if (!fragment) throw new Error("Synthetic Mac capture produced no reviewed fragment.");

const pursuit = await client.createPursuit({
  idempotency_key: `macos-release-boundary:${runID}:pursuit`,
  type: "recruiting",
  title: "Synthetic Mac derivative proof",
  target_outcome: "mutual_final_decision",
  target_date: "2026-10-30",
  status: "active",
  milestone: "shortlist_review",
  roles: [
    {
      subject_ref: { type: "person", id: capture.identity.person_id },
      role_type: "candidate",
      status: "active",
      confidence: "confirmed",
      basis_kind: "evidence_supported",
      evidence_refs: [fragment.id],
    },
  ],
});

const accepted = await client.createPursuitAgentTask(pursuit.pursuit.id, {
  idempotency_key: `macos-release-boundary:${runID}:task`,
  client_event_id: randomUUID(),
  expected_revision: pursuit.pursuit.revision,
  task_kind: "pre_call_briefing",
  capture_id: capture.capture_id,
  objective: "[synthetic-macos-proposal-e2e] Form one review-only dependency; perform no external effect.",
  evidence_refs: [fragment.id],
});

let task = accepted.task;
for (let attempt = 0; attempt < 100; attempt += 1) {
  if (task.status !== "active") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
  task = (await client.getAgentTask(task.id)).task;
}
if (task.status === "active" || !task.latest_run?.id) {
  throw new Error("Synthetic Mac Agent Task did not settle with a canonical Run.");
}
const canonicalRun = await client.getAgentRun(task.latest_run.id);
const preDeletion = {
  task_id: task.id,
  task_status: task.status,
  task_revision: task.task_revision,
  run_id: canonicalRun.run.id,
  run_evidence_ids: canonicalRun.run.context_manifest.evidence.map((item) => item.fragment_id),
  capture_id: capture.capture_id,
  resource_id: capture.resource.id,
  fragment_id: fragment.id,
  private_sentinel: privateSentinel,
  external_effects: task.external_effects,
};

if (ttlExpiryMode) {
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, new Date(expiresAt).getTime() - Date.now() + 2_500)),
  );
  const afterExpiry = await ttlReadback({
    taskID: task.id,
    runID: canonicalRun.run.id,
    resourceID: capture.resource.id,
    captureID: capture.capture_id,
    privateSentinel,
  });
  if (afterExpiry.retention.source_access.state !== "purged") {
    throw new Error("TTL expiry did not purge the governed source.");
  }
  if (afterExpiry.retention.source_access.reason !== "retention_deadline_elapsed") {
    throw new Error("TTL expiry did not preserve the governed expiry reason.");
  }
  if (
    afterExpiry.source_resource.status !== 200 ||
    afterExpiry.source_resource.fragments.length !== 0 ||
    afterExpiry.source_resource.claim_proposals.length !== 0
  ) {
    throw new Error("TTL-expired relationship resource remained readable.");
  }
  if (afterExpiry.task.artifact_status !== "stale") {
    throw new Error("TTL-expired Task artifact did not become stale.");
  }
  const requiredDerivativeTypes = [
    "capture",
    "source_resource",
    "evidence_fragment",
    "pursuit_role",
    "pursuit_role_evidence_registry",
    "pursuit_proposal",
    "pursuit_proposal_item",
    "pursuit_proposal_item_evidence_registry",
    "agent_task",
    "agent_task_run",
    "agent_task_checkpoint",
    "agent_artifact",
    "agent_artifact_evidence_registry",
    "agent_decision_bundle",
    "agent_decision_item",
    "agent_task_event",
    "agent_delivery_outbox_registry",
    "agent_run",
    "agent_run_evidence_registry",
    "agent_run_event_registry",
    "agent_tool_call",
    "agent_run_output",
    "idempotency_record",
  ];
  const observedDerivativeTypes = new Set(
    afterExpiry.retention.derivative_lineage.map((item) => item.entity_type),
  );
  const missingDerivativeTypes = requiredDerivativeTypes.filter(
    (entityType) => !observedDerivativeTypes.has(entityType),
  );
  if (missingDerivativeTypes.length > 0) {
    throw new Error(
      `TTL derivative ledger omitted registered types: ${missingDerivativeTypes.join(", ")}`,
    );
  }
  const derivativeKeys = afterExpiry.retention.derivative_lineage.map(
    (item) => `${item.entity_type}:${item.entity_id}`,
  );
  if (new Set(derivativeKeys).size !== derivativeKeys.length) {
    throw new Error("TTL derivative ledger contained duplicate entity dispositions.");
  }
  if (
    !afterExpiry.retention.derivative_lineage.some(
      (item) => item.disposition === "content_purged",
    ) ||
    !afterExpiry.retention.derivative_lineage.some(
      (item) => item.disposition === "access_revoked",
    ) ||
    !afterExpiry.retention.derivative_lineage.some(
      (item) => item.disposition === "audit_reference_retained",
    ) ||
    !afterExpiry.retention.derivative_lineage.some(
      (item) => item.disposition === "confirmed_state_retained",
    )
  ) {
    throw new Error("TTL derivative ledger did not distinguish every disposition class.");
  }
  const serializedAfterExpiry = JSON.stringify(afterExpiry);
  if (serializedAfterExpiry.includes(privateSentinel)) {
    throw new Error("Private sentinel remained in a post-TTL supported readback.");
  }
  const databaseResidueScan = await scanDatabaseForPrivateResidue(privateSentinel);
  if (databaseResidueScan?.matching_rows !== 0) {
    throw new Error(
      `Private sentinel remained in post-TTL database rows: ${JSON.stringify(databaseResidueScan.matching_tables)}`,
    );
  }
  process.stdout.write(`${JSON.stringify({
    contract_version: CONTRACT_VERSION,
    artifact: "macos-ttl-expiry-derivative-readback-proof",
    pre_expiry: preDeletion,
    post_expiry: afterExpiry,
    database_residue_scan: databaseResidueScan,
    relaunch_probe: {
      task_id: task.id,
      run_id: canonicalRun.run.id,
      resource_id: capture.resource.id,
      capture_id: capture.capture_id,
    },
  }, null, 2)}\n`);
  process.exit(0);
}

const deletion = await client.deleteCapture(capture.capture_id, {
  idempotency_key: `macos-release-boundary:${runID}:delete`,
  reason: "Synthetic recruiter manually cleared the Mac Capsule and every registered derivative.",
});
const afterDeletion = await readback({
  taskID: task.id,
  runID: canonicalRun.run.id,
  resourceID: capture.resource.id,
  deletionID: deletion.deletion_id,
  privateSentinel,
});
const requiredDeletionTypes = [
  "agent_artifact",
  "agent_artifact_evidence_registry",
  "agent_decision_bundle",
  "agent_decision_item",
  "agent_delivery_outbox_registry",
  "agent_run",
  "agent_run_event_registry",
  "agent_run_evidence_registry",
  "agent_run_output",
  "agent_task",
  "agent_task_checkpoint",
  "agent_task_event",
  "agent_task_run",
  "agent_tool_call",
  "assignment",
  "capture",
  "evidence_fragment",
  "idempotency_record",
  "pursuit_proposal",
  "pursuit_proposal_item",
  "source_resource",
  "subject",
];
const observedDeletionTypes = new Set(
  afterDeletion.deletion.lineage.map((item) => item.entity_type),
);
const missingDeletionTypes = requiredDeletionTypes.filter(
  (entityType) => !observedDeletionTypes.has(entityType),
);
if (missingDeletionTypes.length > 0) {
  throw new Error(
    `Manual deletion lineage omitted registered types: ${missingDeletionTypes.join(", ")}`,
  );
}
const deletionKeys = afterDeletion.deletion.lineage.map(
  (item) => `${item.entity_type}:${item.entity_id}`,
);
if (new Set(deletionKeys).size !== deletionKeys.length) {
  throw new Error("Manual deletion lineage contained duplicate entity dispositions.");
}
for (const requiredDisposition of [
  "content_removed",
  "access_revoked",
  "audit_reference_retained",
]) {
  if (
    !afterDeletion.deletion.lineage.some(
      (item) => item.disposition === requiredDisposition,
    )
  ) {
    throw new Error(
      `Manual deletion lineage omitted disposition: ${requiredDisposition}`,
    );
  }
}
if (afterDeletion.database_residue_scan?.matching_rows !== 0) {
  throw new Error(
    `Private sentinel remained in post-deletion database rows: ${JSON.stringify(afterDeletion.database_residue_scan?.matching_tables ?? [])}`,
  );
}
const serializedAfterDeletion = JSON.stringify(afterDeletion);
if (serializedAfterDeletion.includes(privateSentinel)) {
  throw new Error("Private sentinel remained in a post-deletion supported readback.");
}

process.stdout.write(`${JSON.stringify({
  contract_version: CONTRACT_VERSION,
  artifact: "macos-registered-derivative-deletion-proof",
  pre_deletion: preDeletion,
  post_deletion: afterDeletion,
  relaunch_probe: {
    task_id: task.id,
    run_id: canonicalRun.run.id,
    resource_id: capture.resource.id,
    deletion_id: deletion.deletion_id,
    private_sentinel: privateSentinel,
  },
}, null, 2)}\n`);
