import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import { confirmIdentityHandles } from "../modules/identityHandles.js";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const V1 = "identity-freshness-2026-08-07.v1";
const V2 = "identity-freshness-evaluation.v2";

async function run(): Promise<void> {
  const runId = randomUUID();
  const email = `policy-${runId}@example.local`;
  const wechat = `policy_override_${runId.replaceAll("-", "")}`;
  const futurePhone =
    `+658${runId.replaceAll("-", "").replace(/\D/g, "").padEnd(7, "7").slice(0, 7)}`;
  const overrideReason =
    "The synthetic issuer rotates this shared WeChat identifier every four months.";
  const requestedOverride = new Date(Date.now() + 120 * DAY_MS);
  const observedAt = new Date().toISOString();
  const clientResourceId = `identity-policy:${runId}:contact`;
  const request: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `identity-policy:${runId}:capture`,
    channel: "web_upload",
    purpose:
      "Synthetic proof that identity freshness policy and a human deadline override remain reviewable",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: {
      status: "new_person",
      display_label: `Policy fixture ${runId.slice(0, 8)}`,
      relationship_context: {
        status: "proposed",
        label: "Synthetic policy review",
        purpose:
          "Prove versioned identity freshness without making an external decision",
        role: "Candidate",
      },
      binding_basis:
        "The recruiter explicitly created this synthetic person from one governed contact record.",
    },
    resource: {
      client_resource_id: clientResourceId,
      kind: "contact_record",
      display_name: "Synthetic policy contact.txt",
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator: `runtime-identity-policy:${runId}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    confirmed_identity_handles: [
      {
        type: "email",
        value: email,
        source_client_resource_id: clientResourceId,
      },
      {
        type: "wechat",
        value: wechat,
        source_client_resource_id: clientResourceId,
        valid_until: requestedOverride.toISOString(),
        validity_override_reason: overrideReason,
      },
    ],
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "contact_field",
        sequence: 0,
        text: "Reviewed synthetic email and WeChat fields.",
        locator: {
          kind: "contact_field",
          field: "identity handles",
          source_record_version: "1",
        },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: {
          name: "identity-freshness-policy-evaluation",
          version: "1.0.0",
        },
      },
    ],
  };

  const api = new TalentSignalClient(baseUrl);
  await api.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "identity-freshness-policy-evaluation",
  });
  const capture = await api.createResourceCapture(request);
  assert(capture.identity.person_id);
  assert(capture.identity.relationship_context_id);

  const pool = new Pool({
    connectionString: databaseUrl,
    application_name:
      "talent-signal-identity-freshness-policy-evaluation",
    max: 2,
  });
  const transaction = await pool.connect();
  try {
    const rows = await pool.query<{
      account_id: string;
      confirmed_by_user_id: string;
      freshness_policy_version: string;
      handle_type: "email" | "wechat";
      id: string;
      normalized_value_hash: string;
      source_resource_id: string;
      valid_from: Date;
      valid_until: Date;
      validity_basis: string;
      validity_override_reason: string | null;
    }>(
      `SELECT
         account_id,
         id,
         handle_type,
         normalized_value_hash,
         source_resource_id,
         confirmed_by_user_id,
         valid_from,
         valid_until,
         freshness_policy_version,
         validity_basis,
         validity_override_reason
       FROM identity_handles
       WHERE source_resource_id = $1
         AND handle_type IN ('email', 'wechat')
       ORDER BY handle_type`,
      [capture.resource.id],
    );
    assert.equal(rows.rows.length, 2);
    const emailRow = rows.rows.find(
      (row) => row.handle_type === "email",
    );
    const overrideRow = rows.rows.find(
      (row) => row.handle_type === "wechat",
    );
    assert(emailRow);
    assert(overrideRow);
    assert.equal(emailRow.freshness_policy_version, V1);
    assert.equal(emailRow.validity_basis, "policy_default");
    assert.equal(emailRow.validity_override_reason, null);
    assert.equal(
      emailRow.valid_until.getTime() -
        emailRow.valid_from.getTime(),
      365 * DAY_MS,
    );
    assert.equal(overrideRow.freshness_policy_version, V1);
    assert.equal(overrideRow.validity_basis, "human_override");
    assert.equal(
      overrideRow.validity_override_reason,
      overrideReason,
    );
    assert.equal(
      overrideRow.valid_until.toISOString(),
      requestedOverride.toISOString(),
    );

    const lifecycle = await pool.query<{
      freshness_policy_version: string;
      identity_handle_id: string;
      validity_basis: string;
      validity_override_reason: string | null;
    }>(
      `SELECT
         identity_handle_id,
         freshness_policy_version,
         validity_basis,
         validity_override_reason
       FROM identity_handle_lifecycle_events
       WHERE identity_handle_id = ANY($1::uuid[])
       ORDER BY created_at, id`,
      [rows.rows.map((row) => row.id)],
    );
    assert.equal(lifecycle.rows.length, 2);
    assert(
      lifecycle.rows.some(
        (event) =>
          event.identity_handle_id === overrideRow.id &&
          event.freshness_policy_version === V1 &&
          event.validity_basis === "human_override" &&
          event.validity_override_reason === overrideReason,
      ),
    );

    const history = await api.getRelationshipAgentHistory(
      capture.identity.person_id,
      capture.identity.relationship_context_id,
    );
    assert(
      history.operations.some(
        (operation) =>
          operation.kind === "identity_review" &&
          operation.detail.includes(`Policy ${V1}`) &&
          operation.detail.includes(overrideReason),
      ),
    );

    const frozenV1 = rows.rows.map((row) => ({
      id: row.id,
      policy: row.freshness_policy_version,
      validUntil: row.valid_until.toISOString(),
    }));
    const policyTransitionAt = new Date(
      Math.max(Date.now(), requestedOverride.getTime()) + DAY_MS,
    );
    await transaction.query("BEGIN");
    try {
      await transaction.query(
        `UPDATE identity_handle_freshness_policies
         SET effective_until = $2
         WHERE version = $1`,
        [V1, policyTransitionAt],
      );
      await transaction.query(
        `INSERT INTO identity_handle_freshness_policies(
           version,
           effective_from,
           effective_until,
           policy_document,
           max_override_days
         )
         VALUES ($1, $2, NULL, $3, 365)`,
        [
          V2,
          policyTransitionAt,
          {
            description:
              "Synthetic future policy used only inside a rolled-back evaluation transaction.",
            default_validity_days: {
              email: 30,
              phone: 30,
              wechat: 30,
              linkedin_url: 60,
              public_profile_url: 60,
              source_native_id: 15,
            },
          },
        ],
      );
      await confirmIdentityHandles(transaction, {
        accountId: emailRow.account_id,
        confirmedAt: policyTransitionAt,
        confirmedByUserId: emailRow.confirmed_by_user_id,
        handles: [{ type: "phone", value: futurePhone }],
        personId: capture.identity.person_id,
        relationshipContextId:
          capture.identity.relationship_context_id,
        sourceResourceId: capture.resource.id,
      });
      const v2Handle = await transaction.query<{
        freshness_policy_version: string;
        valid_from: Date;
        valid_until: Date;
        validity_basis: string;
      }>(
        `SELECT
           freshness_policy_version,
           validity_basis,
           valid_from,
           valid_until
         FROM identity_handles
         WHERE account_id = $1
           AND handle_type = 'phone'
           AND source_resource_id = $2
           AND freshness_policy_version = $3`,
        [emailRow.account_id, capture.resource.id, V2],
      );
      assert.equal(v2Handle.rows[0]?.freshness_policy_version, V2);
      assert.equal(v2Handle.rows[0]?.validity_basis, "policy_default");
      assert.equal(
        (v2Handle.rows[0]?.valid_until.getTime() ?? 0) -
          (v2Handle.rows[0]?.valid_from.getTime() ?? 0),
        30 * DAY_MS,
      );

      const unchangedV1 = await transaction.query<{
        freshness_policy_version: string;
        id: string;
        valid_until: Date;
      }>(
        `SELECT id, freshness_policy_version, valid_until
         FROM identity_handles
         WHERE id = ANY($1::uuid[])
         ORDER BY id`,
        [rows.rows.map((row) => row.id)],
      );
      assert.deepEqual(
        unchangedV1.rows
          .map((row) => ({
            id: row.id,
            policy: row.freshness_policy_version,
            validUntil: row.valid_until.toISOString(),
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        frozenV1
          .toSorted((left, right) => left.id.localeCompare(right.id)),
      );
    } finally {
      await transaction.query("ROLLBACK");
    }

    await assert.rejects(
      pool.query(
        `UPDATE identity_handle_freshness_policies
         SET max_override_days = max_override_days - 1
         WHERE version = $1`,
        [V1],
      ),
      /only one-way retirement is allowed/,
    );
    await assert.rejects(
      pool.query(
        `DELETE FROM identity_handle_freshness_policies
         WHERE version = $1`,
        [V1],
      ),
      /cannot be deleted/,
    );
    await assert.rejects(
      pool.query(
        `INSERT INTO identity_handle_freshness_policies(
           version,
           effective_from,
           effective_until,
           policy_document,
           max_override_days
         )
         VALUES (
           'identity-freshness-overlap-evaluation.v1',
           now(),
           now() + interval '1 day',
           '{"default_validity_days": {}}'::jsonb,
           30
         )`,
      ),
      /effective intervals cannot overlap/,
    );

    const privacyProjection = JSON.stringify({
      handles: rows.rows,
      lifecycle: lifecycle.rows,
      history: history.operations,
    });
    assert(!privacyProjection.includes(email));
    assert(!privacyProjection.includes(wechat));
    assert(!privacyProjection.includes(futurePhone));

    process.stdout.write(
      `${JSON.stringify(
        {
          artifact:
            "identity-freshness-policy-runtime-proof",
          captured_at: new Date().toISOString(),
          contract_version: CONTRACT_VERSION,
          run_id: runId,
          person_id: capture.identity.person_id,
          relationship_context_id:
            capture.identity.relationship_context_id,
          source_resource_id: capture.resource.id,
          active_policy: {
            version: V1,
            default_email_days: 365,
            default_basis: emailRow.validity_basis,
          },
          human_override: {
            policy_version:
              overrideRow.freshness_policy_version,
            basis: overrideRow.validity_basis,
            reason_visible_in_agent_history: true,
            exact_deadline_preserved: true,
          },
          simulated_future_policy: {
            version: V2,
            default_phone_days: 30,
            transaction_rolled_back: true,
            prior_v1_deadlines_unchanged: true,
            prior_v1_policy_versions_unchanged: true,
            published_policy_content_immutable: true,
            published_policy_deletion_blocked: true,
            overlapping_policy_interval_blocked: true,
          },
          safety: {
            override_without_reason_rejected_by_unit_test: true,
            policy_and_basis_preserved_in_lifecycle: true,
            raw_handles_absent_from_governance_projection: true,
            consequential_external_writes: 0,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    transaction.release();
    await pool.end();
  }
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${
      error instanceof Error
        ? error.stack ?? error.message
        : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
