import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import { sweepDueIdentityHandles } from "../modules/identityHandles.js";

const baseUrl =
  process.env.TALENT_SIGNAL_EVALUATION_URL ??
  "http://127.0.0.1:4317";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

function contactRequest(input: {
  email: string;
  personScope: ResourceCaptureRequest["person_scope"];
  runId: string;
  suffix: string;
  confirmHandle: boolean;
}): ResourceCaptureRequest {
  const clientResourceId =
    `identity-freshness:${input.runId}:${input.suffix}`;
  const observedAt = new Date().toISOString();
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key:
      `identity-freshness:${input.runId}:${input.suffix}`,
    channel:
      input.suffix === "anchor" ? "web_upload" : "ios_share",
    purpose:
      "Synthetic proof that identity freshness is independent from source authorization",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: input.personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: "contact_record",
      display_name:
        input.suffix === "anchor"
          ? "Reviewed CRM contact"
          : "Fresh mobile contact card",
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator:
        `runtime-identity-freshness:${input.runId}:${input.suffix}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    ...(input.confirmHandle
      ? {
          confirmed_identity_handles: [
            {
              type: "email" as const,
              value: input.email,
              source_client_resource_id: clientResourceId,
              valid_until: new Date(
                Date.now() + 7 * 24 * 60 * 60_000,
              ).toISOString(),
            },
          ],
        }
      : {}),
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "contact_field",
        sequence: 0,
        text: `Email: ${input.email}`,
        locator: {
          kind: "contact_field",
          field: "email",
          source_record_version:
            input.suffix === "anchor" ? "1" : "2",
        },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: {
          name: "identity-handle-freshness-evaluation",
          version: "1.0.0",
        },
      },
    ],
  };
}

function matchKinds(
  directory: Awaited<ReturnType<TalentSignalClient["searchPeople"]>>,
  personId: string,
): string[] {
  return (
    directory.people
      .find((person) => person.id === personId)
      ?.identity_matches.map((match) => match.kind) ?? []
  );
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const email = `freshness-${runId}@example.test`;
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "identity-handle-freshness-evaluation",
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: "talent-signal-identity-freshness-evaluation",
    max: 2,
  });

  try {
    const anchor = await client.createResourceCapture(
      contactRequest({
        email,
        runId,
        suffix: "anchor",
        confirmHandle: true,
        personScope: {
          status: "new_person",
          display_label:
            `Freshness proof ${runId.slice(0, 8)}`,
          relationship_context: {
            status: "proposed",
            label: "Executive-search relationship",
            purpose:
              "Keep multichannel evidence on one stable person",
            role: "Candidate",
          },
          binding_basis:
            "The recruiter reviewed the synthetic CRM record and explicitly created this person.",
        },
      }),
    );
    assert(anchor.identity.person_id);
    assert(anchor.identity.relationship_context_id);
    const personId = anchor.identity.person_id;
    const relationshipContextId =
      anchor.identity.relationship_context_id;

    const beforeExpiry = await client.searchPeople(email);
    assert.deepEqual(
      matchKinds(beforeExpiry, personId),
      ["confirmed_handle"],
    );

    const handleResult = await pool.query<{
      account_id: string;
      display_hint: string;
      id: string;
      normalized_value_hash: string;
    }>(
      `UPDATE identity_handles
       SET valid_until = now() - interval '1 second',
           updated_at = now()
       WHERE source_resource_id = $1
         AND handle_type = 'email'
         AND status = 'confirmed'
       RETURNING
         account_id,
         display_hint,
         id,
         normalized_value_hash`,
      [anchor.resource.id],
    );
    const handle = handleResult.rows[0];
    assert(handle);
    const expiredIds = await sweepDueIdentityHandles(
      pool,
      new Date(),
    );
    assert(expiredIds.includes(handle.id));

    const afterExpiry = await client.searchPeople(email);
    assert.deepEqual(
      matchKinds(afterExpiry, personId),
      ["expired_handle"],
    );
    if (
      process.env
        .TALENT_SIGNAL_EVALUATION_STOP_AFTER_EXPIRY === "true"
    ) {
      process.stdout.write(
        `${JSON.stringify(
          {
            artifact:
              "expired-identity-handle-ui-fixture",
            email,
            handle_id: handle.id,
            person_id: personId,
            relationship_context_id:
              relationshipContextId,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const reviewCapture = await client.createResourceCapture(
      contactRequest({
        email,
        runId,
        suffix: "fresh-review",
        confirmHandle: false,
        personScope: {
          status: "unresolved",
          display_name_hint:
            `Possibly ${runId.slice(0, 8)}`,
          handles: [
            {
              type: "email",
              value: email,
              source_client_resource_id:
                `identity-freshness:${runId}:fresh-review`,
            },
          ],
          reason:
            "The same email was seen in a fresh contact card, but its prior confirmation expired and cannot bind identity automatically.",
        },
      }),
    );
    assert.equal(reviewCapture.identity.status, "needs_review");
    assert.equal(reviewCapture.identity.person_id, null);
    assert.equal(
      reviewCapture.resource.processing_state,
      "needs_identity_review",
    );
    assert(reviewCapture.identity.resolution_case_id);
    assert.deepEqual(
      reviewCapture.identity.candidate_person_ids,
      [personId],
    );

    const stillExpired = await client.searchPeople(email);
    assert.deepEqual(
      matchKinds(stillExpired, personId),
      ["expired_handle"],
    );

    const caseId = reviewCapture.identity.resolution_case_id;
    const identityCase =
      await client.getIdentityResolutionCase(caseId);
    assert.equal(identityCase.status, "pending");
    assert.equal(identityCase.candidates.length, 1);
    assert.equal(
      identityCase.candidates[0]?.person_id,
      personId,
    );
    const resolution = await client.decideIdentityResolutionCase(
      caseId,
      {
        idempotency_key:
          `identity-freshness:${runId}:bind-reviewed-source`,
        expected_case_version: identityCase.version,
        decision: "bind_existing",
        selected_person_id: personId,
        relationship_context: {
          status: "existing",
          relationship_context_id: relationshipContextId,
        },
        reason:
          "The recruiter compared the fresh governed contact card with the person page and explicitly confirmed the same identity.",
      },
    );
    assert.equal(resolution.identity_status, "bound");
    assert.equal(resolution.person_id, personId);
    assert.equal(
      resolution.relationship_context_id,
      relationshipContextId,
    );
    assert.equal(resolution.identity_handles_confirmed, 1);

    const reconfirmed = await client.searchPeople(email);
    assert.deepEqual(
      matchKinds(reconfirmed, personId),
      ["confirmed_handle"],
    );

    const wiki = await client.compileKnowledge(
      personId,
      relationshipContextId,
      {
        idempotency_key:
          `identity-freshness:${runId}:compile`,
        objective:
          "Compile the one stable person after reviewed multichannel identity convergence",
      },
    );
    assert.equal(wiki.status, "published");
    assert.equal(wiki.quality.verdict, "gold");

    const history = await client.getRelationshipAgentHistory(
      personId,
      relationshipContextId,
    );
    const historyTitles = history.operations.map(
      (operation) => operation.title,
    );
    assert(
      historyTitles.includes(
        "Identity clue needs fresh confirmation",
      ),
    );
    assert(historyTitles.includes("Identity clue reconfirmed"));

    const otherAccount = new TalentSignalClient(baseUrl);
    await otherAccount.login({
      account_slug: "fixture-beta",
      user_email: "recruiter@beta.local",
      client_label:
        "identity-handle-freshness-cross-account-evaluation",
    });
    const crossAccount = await otherAccount.searchPeople(email);
    assert.equal(crossAccount.people.length, 0);

    const lifecycle = await pool.query<{
      actor_kind: string;
      event_type: string;
      status: string;
    }>(
      `SELECT actor_kind, event_type, status
       FROM identity_handle_lifecycle_events
       WHERE account_id = $1
         AND identity_handle_id = $2
       ORDER BY created_at, id`,
      [handle.account_id, handle.id],
    );
    assert.deepEqual(
      lifecycle.rows.map((event) => event.event_type),
      ["confirmed", "expired", "reconfirmed"],
    );
    assert.deepEqual(
      lifecycle.rows.map((event) => event.actor_kind),
      ["human", "system", "human"],
    );
    const audit = await pool.query<{
      event_type: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata
       FROM audit_events
       WHERE account_id = $1
         AND entity_type = 'identity_handle'
         AND entity_id = $2
       ORDER BY sequence`,
      [handle.account_id, handle.id],
    );
    const identityIndexAndHistory = JSON.stringify({
      audit: audit.rows,
      display_hint: handle.display_hint,
      lifecycle: lifecycle.rows,
      normalized_value_hash: handle.normalized_value_hash,
    });
    assert(!identityIndexAndHistory.includes(email));

    process.stdout.write(
      `${JSON.stringify(
        {
          artifact:
            "identity-handle-freshness-runtime-proof",
          captured_at: new Date().toISOString(),
          contract_version: CONTRACT_VERSION,
          run_id: runId,
          stable_person: {
            person_id: personId,
            relationship_context_id:
              relationshipContextId,
            converged_capture_ids: [
              anchor.capture_id,
              reviewCapture.capture_id,
            ],
            compiled_wiki_verdict: wiki.quality.verdict,
          },
          temporal_identity: {
            before_deadline_match: "confirmed_handle",
            expired_handle_id: handle.id,
            after_deadline_match: "expired_handle",
            expired_clue_auto_bound: false,
            review_case_id: caseId,
            review_candidate_person_ids:
              reviewCapture.identity.candidate_person_ids,
            recruiter_decision: resolution.decision,
            after_fresh_source_match: "confirmed_handle",
            lifecycle: lifecycle.rows,
          },
          safety: {
            account_scoped_search: true,
            raw_handle_absent_from_identity_index_and_history:
              true,
            source_authorization_clock_independent: true,
            human_decision_required_before_reconfirmation:
              true,
          },
          durable_agent_history: {
            expiry_visible: true,
            reconfirmation_visible: true,
            titles: historyTitles.filter((title) =>
              title.startsWith("Identity clue"),
            ),
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
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
