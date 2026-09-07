import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { RuntimeObservationSession, RuntimeObservationOutbox, RuntimeObserver,
  type RuntimeObservationContext, type RuntimeObservationPolicy } from "@talent-signal/agent";
import { runtimeObservationSourcesAvailable, sweepRuntimeObservationSources } from "./runtimeObservationLifecycle.js";

const databaseURL = process.env.FEEDBACK_TEST_DATABASE_URL;
if (databaseURL && !["localhost", "127.0.0.1"].includes(new URL(databaseURL).hostname)) throw new Error("Use the disposable loopback proof database.");
const pool = databaseURL ? new Pool({ connectionString: databaseURL }) : null;
afterAll(async () => { await pool?.end(); });
it.skipIf(!pool)("invalidates full media and revoked capture observation without a feedback snapshot or Session", async () => {
  const account = randomUUID(), user = randomUUID(), person = randomUUID(), relationship = randomUUID(), media = randomUUID(), capture = randomUUID();
  await pool!.query("INSERT INTO accounts(id,slug,name) VALUES($1,$2,'Synthetic observation')", [account, `get11-observation-${account}`]);
  await pool!.query("INSERT INTO users(id,account_id,email,display_name,kind) VALUES($1,$2,'observation@example.test','Synthetic','simulated_human')", [user, account]);
  await pool!.query("INSERT INTO subjects(id,account_id,external_ref,display_label) VALUES($1,$2,$3,'Synthetic')", [person, account, person]);
  await pool!.query("INSERT INTO assignments(id,account_id,subject_id,external_ref,display_label) VALUES($1,$2,$3,$4,'Synthetic')", [relationship, account, person, relationship]);
  for (const id of [media, randomUUID()]) await pool!.query(`INSERT INTO chat_media_assets(id,account_id,subject_id,assignment_id,created_by_user_id,idempotency_key,file_name,media_type,byte_size,storage_provider,object_key,status)
    VALUES($1,$2,$3,$4,$5,$6,'synthetic.png','image/png',1,'local',$6,'ready')`, [id, account, person, relationship, user, randomUUID()]);
  for (const id of [capture, randomUUID()]) {
    await pool!.query(`INSERT INTO captures(id,account_id,created_by_user_id,subject_id,assignment_id,source_kind,source_metadata,identity_status,identity_context,purpose)
      VALUES($1,$2,$3,$4,$5,'conversation_transcript','{}','bound','{}','Synthetic observation proof')`, [id, account, user, person, relationship]);
    await pool!.query(`INSERT INTO source_retention_receipts(receipt_id,account_id,capture_id,policy_version,requested_mode,effective_mode,source_scope,source_access_state,source_access_reason,created_at,updated_at)
      VALUES($1,$2,$3,'source-retention.v2','ephemeral','ephemeral','reviewed_selected_text','available','awaiting_review_completion',now(),now())`, [randomUUID(), account, id]);
  }
  const policy: RuntimeObservationPolicy = { version: "private_full_content.v1", mode: "private_full_content",
    endpoint: "http://localhost:5173/api", workspace: "default", project: "get11-synthetic-source-proof",
    source_workspace_ids: [account], authorization_scopes: ["relationship_image"], retention_days: 1, max_content_bytes: 1024 * 1024 };
  const root = await mkdtemp(join(tmpdir(), "get11-observation-lifecycle-"));
  const retain = vi.fn(), remove = vi.fn();
  const outbox = new RuntimeObservationOutbox(root, policy, { retain, remove });
  const observer = new RuntimeObserver(outbox);
  for (const kind of ["media", "capture"] as const) {
    const context: RuntimeObservationContext = { run_id: randomUUID(), workspace_id: account, authorization_scope: "relationship_image",
      source_refs: { kind: "product", media_ids: kind === "media" ? [media] : [], capture_ids: kind === "capture" ? [capture] : [],
        fragment_ids: [], person_ids: [person], relationship_context_ids: [relationship], expires_at: new Date(Date.now() + 60_000).toISOString() } };
    expect(await runtimeObservationSourcesAvailable(pool!, context)).toBe(true);
    const session = new RuntimeObservationSession(policy, context, { media: "synthetic private image bytes" }, outbox);
    await session.complete({ answer: "synthetic private business output" }, "ok");
    if (kind === "media") { await outbox.flush(); expect(retain).not.toHaveBeenCalled(); }
    await sweepRuntimeObservationSources(pool!, observer);
    await vi.waitFor(async () => expect((await outbox.status()).retained).toBe(1));
    if (kind === "media") await pool!.query("UPDATE chat_media_assets SET status='deleted',deleted_at=now() WHERE id=$1", [media]);
    else await pool!.query("UPDATE source_retention_receipts SET authorization_state='revoked' WHERE capture_id=$1", [capture]);
    expect(await runtimeObservationSourcesAvailable(pool!, context)).toBe(false);
    await sweepRuntimeObservationSources(pool!, observer);
    await vi.waitFor(async () => expect((await outbox.status()).retained).toBe(0));
    expect(await readFile(join(root, `${session.id}.json`), "utf8")).not.toContain("synthetic private");
  }
  expect(retain).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(remove.mock.calls.length).toBeGreaterThanOrEqual(2));
  const regression = randomUUID(), livingRegression = randomUUID();
  for (const id of [regression, livingRegression]) await pool!.query(`INSERT INTO lab_regressions(id,account_id,user_id,request_hash,content_hash,snapshot)
    VALUES($1,$2,$3,$4,$4,'{"data_class":"registered_synthetic"}')`, [id, account, user, `synthetic-${id}`]);
  const regressionContext: RuntimeObservationContext = { run_id: randomUUID(), workspace_id: account,
    authorization_scope: "relationship_image", source_regression_id: regression,
    source_refs: { kind: "product", capture_ids: [], fragment_ids: [], media_ids: [], person_ids: [], relationship_context_ids: [],
      expires_at: new Date(Date.now() + 60_000).toISOString() } };
  expect(await runtimeObservationSourcesAvailable(pool!, regressionContext)).toBe(true);
  const session = new RuntimeObservationSession(policy, regressionContext, { text: "synthetic regression-only source" }, outbox);
  await session.complete({ answer: "synthetic output" }, "ok"); await outbox.flush();
  expect((await outbox.status()).retained).toBe(1);
  await pool!.query("UPDATE lab_regressions SET expires_at=now()-interval '1 second' WHERE id=$1", [regression]);
  expect(await runtimeObservationSourcesAvailable(pool!, { ...regressionContext, source_regression_id: null,
    source_regression_ids: [livingRegression, regression], source_refs: { kind: "synthetic" } })).toBe(false);
  // The ordinary 30-second exporter uses this path while the product is idle.
  await outbox.flush();
  expect((await outbox.status()).deleted).toBe(3);
  expect(await readFile(join(root, `${session.id}.json`), "utf8")).not.toContain("synthetic regression-only source");
}, 90_000);
