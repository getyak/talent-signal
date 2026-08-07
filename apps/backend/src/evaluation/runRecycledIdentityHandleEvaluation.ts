import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  TalentSignalHttpError,
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
  channel: ResourceCaptureRequest["channel"];
  confirmHandle: boolean;
  personScope: ResourceCaptureRequest["person_scope"];
  phone: string;
  runId: string;
  suffix: string;
}): ResourceCaptureRequest {
  const clientResourceId =
    `recycled-identity:${input.runId}:${input.suffix}`;
  const observedAt = new Date().toISOString();
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key:
      `recycled-identity:${input.runId}:${input.suffix}`,
    channel: input.channel,
    purpose:
      "Synthetic proof for one recycled identity clue with distinct historical and current owners",
    captured_at: observedAt,
    source_timezone: "Asia/Singapore",
    person_scope: input.personScope,
    resource: {
      client_resource_id: clientResourceId,
      kind: "contact_record",
      display_name: `${input.suffix}.txt`,
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Singapore",
      source_locator:
        `runtime-recycled-identity:${input.runId}:${input.suffix}`,
      retention: {
        requested_mode: "ephemeral",
        source_scope: "reviewed_selected_text",
      },
    },
    ...(input.confirmHandle
      ? {
          confirmed_identity_handles: [
            {
              type: "phone" as const,
              value: input.phone,
              source_client_resource_id: clientResourceId,
            },
          ],
        }
      : {}),
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "contact_field",
        sequence: 0,
        text: `Phone: ${input.phone}`,
        locator: {
          kind: "contact_field",
          field: "phone",
          source_record_version: input.suffix,
        },
        attribution: {
          actor_kind: "recruiter",
          status: "confirmed",
        },
        review_status: "reviewed",
        parser: {
          name: "recycled-identity-handle-evaluation",
          version: "1.0.0",
        },
      },
    ],
  };
}

async function expectConflict(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof TalentSignalHttpError);
    assert.equal(error.status, 409);
    assert.equal(error.code, expectedCode);
    return;
  }
  throw new Error(`Expected ${expectedCode}.`);
}

function matchedPersonIds(
  directory: Awaited<ReturnType<TalentSignalClient["searchPeople"]>>,
  kind: "confirmed_handle" | "expired_handle",
): string[] {
  return directory.people
    .filter((person) =>
      person.identity_matches.some((match) => match.kind === kind),
    )
    .map((person) => person.id);
}

async function run(): Promise<void> {
  const runId = randomUUID();
  const digits = runId.replaceAll("-", "").replace(/\D/g, "");
  const paddedDigits = `${digits}3141592653`.slice(0, 7);
  const phone = `+658${paddedDigits}`;
  const client = new TalentSignalClient(baseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "recycled-identity-handle-evaluation",
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name:
      "talent-signal-recycled-identity-evaluation",
    max: 2,
  });

  try {
    const historicalOwner = await client.createResourceCapture(
      contactRequest({
        channel: "web_upload",
        confirmHandle: true,
        phone,
        runId,
        suffix: "historical-owner",
        personScope: {
          status: "new_person",
          display_label:
            `Historical owner ${runId.slice(0, 8)}`,
          relationship_context: {
            status: "proposed",
            label: "Prior candidate relationship",
            purpose:
              "Preserve the historical owner without retaining current authority",
            role: "Candidate",
          },
          binding_basis:
            "The recruiter explicitly created the historical synthetic owner from a governed contact record.",
        },
      }),
    );
    assert(historicalOwner.identity.person_id);
    assert(historicalOwner.identity.relationship_context_id);
    const historicalPersonId =
      historicalOwner.identity.person_id;
    const historicalContextId =
      historicalOwner.identity.relationship_context_id;

    const historicalHandle = await pool.query<{
      account_id: string;
      id: string;
      normalized_value_hash: string;
    }>(
      `UPDATE identity_handles
       SET valid_until = now() - interval '1 second',
           updated_at = now()
       WHERE source_resource_id = $1
         AND handle_type = 'phone'
         AND status = 'confirmed'
       RETURNING account_id, id, normalized_value_hash`,
      [historicalOwner.resource.id],
    );
    const originalHandle = historicalHandle.rows[0];
    assert(originalHandle);
    const expired = await sweepDueIdentityHandles(
      pool,
      new Date(),
    );
    assert(expired.includes(originalHandle.id));

    const currentOwner = await client.createResourceCapture(
      contactRequest({
        channel: "ios_share",
        confirmHandle: true,
        phone,
        runId,
        suffix: "current-owner",
        personScope: {
          status: "new_person",
          display_label:
            `Current owner ${runId.slice(0, 8)}`,
          relationship_context: {
            status: "proposed",
            label: "Current client relationship",
            purpose:
              "Prove that a recycled clue can gain a new current owner without erasing history",
            role: "Client",
          },
          binding_basis:
            "The recruiter reviewed a fresh governed contact record and explicitly created the distinct current owner.",
        },
      }),
    );
    assert(currentOwner.identity.person_id);
    assert(currentOwner.identity.relationship_context_id);
    const currentPersonId = currentOwner.identity.person_id;
    const currentContextId =
      currentOwner.identity.relationship_context_id;

    const twoOwnerSearch = await client.searchPeople(phone);
    assert.equal(twoOwnerSearch.people[0]?.id, currentPersonId);
    assert.deepEqual(
      matchedPersonIds(twoOwnerSearch, "confirmed_handle"),
      [currentPersonId],
    );
    assert.deepEqual(
      matchedPersonIds(twoOwnerSearch, "expired_handle"),
      [historicalPersonId],
    );

    const unresolved = await client.createResourceCapture(
      contactRequest({
        channel: "browser_extension",
        confirmHandle: false,
        phone,
        runId,
        suffix: "later-unresolved-source",
        personScope: {
          status: "unresolved",
          display_name_hint: "Shared contact clue",
          handles: [
            {
              type: "phone",
              value: phone,
              source_client_resource_id:
                `recycled-identity:${runId}:later-unresolved-source`,
            },
          ],
          reason:
            "This recycled phone has a current and a historical owner, so the recruiter must compare temporal identity evidence.",
        },
      }),
    );
    assert.equal(unresolved.identity.status, "needs_review");
    assert.deepEqual(
      unresolved.identity.candidate_person_ids,
      [currentPersonId, historicalPersonId],
    );
    assert(unresolved.identity.resolution_case_id);
    const caseId = unresolved.identity.resolution_case_id;
    const identityCase =
      await client.getIdentityResolutionCase(caseId);
    assert.deepEqual(
      identityCase.candidates.map((candidate) => candidate.person_id),
      [currentPersonId, historicalPersonId],
    );
    assert(
      identityCase.candidates[0]?.match_reasons.some((reason) =>
        reason.includes("Current confirmed phone clue"),
      ),
    );
    assert(
      identityCase.candidates[1]?.match_reasons.some(
        (reason) =>
          reason.includes("Expired phone clue") &&
          reason.includes("explicit binding"),
      ),
    );

    await expectConflict(
      () =>
        client.decideIdentityResolutionCase(caseId, {
          idempotency_key:
            `recycled-identity:${runId}:wrong-owner`,
          expected_case_version: identityCase.version,
          decision: "bind_existing",
          selected_person_id: historicalPersonId,
          relationship_context: {
            status: "existing",
            relationship_context_id: historicalContextId,
          },
          reason:
            "This synthetic attempt must fail because the same clue currently belongs to a different person.",
        }),
      "IDENTITY_HANDLE_CONFIRMED_ELSEWHERE",
    );

    const boundCurrent =
      await client.decideIdentityResolutionCase(caseId, {
        idempotency_key:
          `recycled-identity:${runId}:current-owner`,
        expected_case_version: identityCase.version,
        decision: "bind_existing",
        selected_person_id: currentPersonId,
        relationship_context: {
          status: "existing",
          relationship_context_id: currentContextId,
        },
        reason:
          "The recruiter compared the fresh governed source and explicitly selected the current owner.",
      });
    assert.equal(boundCurrent.person_id, currentPersonId);
    assert.equal(boundCurrent.identity_handles_confirmed, 1);

    const unresolvedDetail =
      await client.getRelationshipResource(unresolved.resource.id);
    const correction =
      await client.correctCaptureIdentity(
        unresolved.capture_id,
        {
          idempotency_key:
            `recycled-identity:${runId}:correct-source`,
          expected_capture_version:
            unresolvedDetail.resource.capture_version,
          expected_person_id: currentPersonId,
          expected_relationship_context_id: currentContextId,
          reason:
            "The recruiter later verified that this one incoming source belongs with the historical person, without restoring the old phone as current identity.",
          binding_basis:
            "The governed source was compared with both person pages and explicitly moved.",
          target: {
            status: "existing_person",
            person_id: historicalPersonId,
            relationship_context: {
              status: "existing",
              relationship_context_id: historicalContextId,
            },
          },
        },
      );
    assert.equal(correction.identity_handles_returned_to_review, 1);
    const afterCorrection = await client.searchPeople(phone);
    assert.deepEqual(
      matchedPersonIds(afterCorrection, "confirmed_handle"),
      [],
    );
    assert.deepEqual(
      matchedPersonIds(afterCorrection, "expired_handle"),
      [historicalPersonId],
    );

    const recovery = await client.createResourceCapture(
      contactRequest({
        channel: "api_connector",
        confirmHandle: true,
        phone,
        runId,
        suffix: "current-owner-recovery",
        personScope: {
          status: "confirmed",
          person_id: currentPersonId,
          relationship_context: {
            status: "existing",
            relationship_context_id: currentContextId,
          },
          binding_basis:
            "The recruiter explicitly supplied another fresh governed record for the current owner after correcting the unrelated source.",
        },
      }),
    );
    const recoveredSearch = await client.searchPeople(phone);
    assert.equal(recoveredSearch.people[0]?.id, currentPersonId);
    assert.deepEqual(
      matchedPersonIds(recoveredSearch, "confirmed_handle"),
      [currentPersonId],
    );
    assert.deepEqual(
      matchedPersonIds(recoveredSearch, "expired_handle"),
      [historicalPersonId],
    );

    const deletion = await client.deleteCapture(
      recovery.capture_id,
      {
        idempotency_key:
          `recycled-identity:${runId}:delete-recovery`,
        reason:
          "Remove the synthetic recovery source and its current identity authority.",
      },
    );
    assert(deletion.deletion_id);
    const afterDeletion = await client.searchPeople(phone);
    assert.deepEqual(
      matchedPersonIds(afterDeletion, "confirmed_handle"),
      [],
    );
    assert.deepEqual(
      matchedPersonIds(afterDeletion, "expired_handle"),
      [historicalPersonId],
    );

    const finalCurrent = await client.createResourceCapture(
      contactRequest({
        channel: "ios_share",
        confirmHandle: true,
        phone,
        runId,
        suffix: "current-owner-final",
        personScope: {
          status: "confirmed",
          person_id: currentPersonId,
          relationship_context: {
            status: "existing",
            relationship_context_id: currentContextId,
          },
          binding_basis:
            "The recruiter explicitly restored current ownership from a final fresh governed contact card.",
        },
      }),
    );
    const finalSearch = await client.searchPeople(phone);
    assert.equal(finalSearch.people[0]?.id, currentPersonId);
    assert.deepEqual(
      matchedPersonIds(finalSearch, "confirmed_handle"),
      [currentPersonId],
    );
    assert.deepEqual(
      matchedPersonIds(finalSearch, "expired_handle"),
      [historicalPersonId],
    );

    const historicalWiki = await client.compileKnowledge(
      historicalPersonId,
      historicalContextId,
      {
        idempotency_key:
          `recycled-identity:${runId}:historical-wiki`,
        objective:
          "Compile the historical owner without restoring expired identity authority",
      },
    );
    const currentWiki = await client.compileKnowledge(
      currentPersonId,
      currentContextId,
      {
        idempotency_key:
          `recycled-identity:${runId}:current-wiki`,
        objective:
          "Compile the current owner from current governed evidence",
      },
    );
    assert.equal(historicalWiki.quality.verdict, "gold");
    assert.equal(currentWiki.quality.verdict, "gold");

    const handleRows = await pool.query<{
      display_hint: string | null;
      id: string;
      normalized_value_hash: string;
      status: string;
      subject_id: string;
    }>(
      `SELECT
         id,
         subject_id,
         normalized_value_hash,
         display_hint,
         status
       FROM identity_handles
       WHERE account_id = $1
         AND handle_type = 'phone'
         AND normalized_value_hash = $2
       ORDER BY created_at, id`,
      [
        originalHandle.account_id,
        originalHandle.normalized_value_hash,
      ],
    );
    const lifecycle = await pool.query<{
      actor_kind: string;
      event_type: string;
      identity_handle_id: string;
      status: string;
      subject_id: string;
    }>(
      `SELECT
         identity_handle_id,
         subject_id,
         actor_kind,
         event_type,
         status
       FROM identity_handle_lifecycle_events
       WHERE account_id = $1
         AND identity_handle_id = ANY($2::uuid[])
       ORDER BY created_at, id`,
      [
        originalHandle.account_id,
        handleRows.rows.map((row) => row.id),
      ],
    );
    const audit = await pool.query<{
      event_type: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata
       FROM audit_events
       WHERE account_id = $1
         AND entity_type = 'identity_handle'
         AND entity_id = ANY($2::uuid[])
       ORDER BY sequence`,
      [
        originalHandle.account_id,
        handleRows.rows.map((row) => row.id),
      ],
    );
    assert(
      lifecycle.rows.some(
        (event) =>
          event.subject_id === historicalPersonId &&
          event.event_type === "expired",
      ),
    );
    assert(
      lifecycle.rows.some(
        (event) =>
          event.subject_id === currentPersonId &&
          event.event_type === "confirmed",
      ),
    );
    const privacyProjection = JSON.stringify({
      audit: audit.rows,
      handles: handleRows.rows,
      lifecycle: lifecycle.rows,
    });
    assert(!privacyProjection.includes(phone));

    const otherAccount = new TalentSignalClient(baseUrl);
    await otherAccount.login({
      account_slug: "fixture-beta",
      user_email: "recruiter@beta.local",
      client_label:
        "recycled-identity-handle-cross-account-evaluation",
    });
    const crossAccount = await otherAccount.searchPeople(phone);
    assert.equal(crossAccount.people.length, 0);

    process.stdout.write(
      `${JSON.stringify(
        {
          artifact:
            "recycled-identity-handle-runtime-proof",
          captured_at: new Date().toISOString(),
          contract_version: CONTRACT_VERSION,
          run_id: runId,
          historical_owner: {
            person_id: historicalPersonId,
            relationship_context_id:
              historicalContextId,
            final_match: "expired_handle",
            wiki_verdict:
              historicalWiki.quality.verdict,
          },
          current_owner: {
            person_id: currentPersonId,
            relationship_context_id: currentContextId,
            final_match: "confirmed_handle",
            final_source_capture_id:
              finalCurrent.capture_id,
            wiki_verdict: currentWiki.quality.verdict,
          },
          ambiguous_intake: {
            case_id: caseId,
            ordered_candidate_person_ids:
              identityCase.candidates.map(
                (candidate) => candidate.person_id,
              ),
            current_reason_visible: true,
            expired_reason_visible: true,
            historical_owner_binding_blocked: true,
            selected_current_owner: true,
          },
          correction_and_deletion: {
            source_corrected_without_restoring_expired_authority:
              true,
            corrected_handles_returned_to_review:
              correction.identity_handles_returned_to_review,
            current_authority_removed_with_deleted_source:
              true,
            final_current_authority_requires_fresh_source:
              true,
          },
          safety: {
            current_owner_ranked_before_historical_owner:
              true,
            raw_handle_absent_from_identity_index_and_history:
              true,
            historical_lifecycle_preserved: true,
            current_lifecycle_preserved: true,
            cross_account_result_count:
              crossAccount.people.length,
            automatic_bind_or_merge: false,
            consequential_external_writes: 0,
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
