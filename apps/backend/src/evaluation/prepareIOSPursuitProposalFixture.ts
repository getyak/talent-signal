import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";
import { Pool } from "pg";

import { sweepDueIdentityHandles } from "../modules/identityHandles.js";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4317";
const fixturePursuitTitles = new Set([
  "Chief Product Officer · Meridian Labs",
  "VP Engineering · Northstar",
  "Synthetic same-name search",
]);
const fixtureCaptureLocatorPrefixes = [
  "synthetic:ios-proposal:",
  "synthetic:ios-same-name:",
  "synthetic:ios-contact:",
] as const;

export function isIOSPursuitProposalFixtureTitle(title: string): boolean {
  return fixturePursuitTitles.has(title);
}

export function isIOSPursuitProposalFixtureLocator(locator: string): boolean {
  return fixtureCaptureLocatorPrefixes.some((prefix) =>
    locator.startsWith(prefix),
  );
}

function fixtureDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER ?? "talent_signal_local"}:${process.env.POSTGRES_PASSWORD ?? "talent_signal_local_only"}@127.0.0.1:${process.env.POSTGRES_PORT ?? "55432"}/${process.env.POSTGRES_DB ?? "talent_signal_local"}`
  );
}

async function createFixture(
  client: TalentSignalClient,
  options: {
    proposalId: string;
    fixtureKey: string;
    personLabel: string;
    title: string;
    ownerUserId: string;
  },
): Promise<{
  proposalId: string;
  pursuitId: string;
  personId: string;
  captureId: string;
}> {
  const runId = randomUUID();
  const clientResourceId = `ios-proposal-ui:${options.fixtureKey}:${runId}`;
  const observedAt = new Date().toISOString();
  const captureRequest: ResourceCaptureRequest = {
    contract_version: CONTRACT_VERSION,
    idempotency_key: `${options.fixtureKey}:${runId}:capture`,
    channel: "ios_share",
    purpose: "Synthetic iOS canonical Proposal receipt proof",
    captured_at: observedAt,
    source_timezone: "Asia/Shanghai",
    person_scope: {
      status: "new_person",
      display_label: options.personLabel,
      relationship_context: {
        status: "proposed",
        label: "Chief Product Officer search",
        purpose: "Synthetic iOS full-stack review",
        role: "Candidate",
      },
      binding_basis: "Synthetic evaluator-created identity.",
    },
    resource: {
      client_resource_id: clientResourceId,
      kind: "conversation_transcript",
      display_name: "Synthetic reviewed candidate message",
      media_type: "text/plain",
      observed_at: observedAt,
      source_timezone: "Asia/Shanghai",
      source_locator: `synthetic:ios-proposal:${options.fixtureKey}:${runId}`,
      retention: {
        requested_mode: "evidence_crop",
        source_scope: "reviewed_evidence_crop",
      },
    },
    fragments: [
      {
        client_resource_id: clientResourceId,
        kind: "message",
        sequence: 0,
        text: `Availability: 2026-09-01, Asia/Shanghai\nSynthetic reference: ${runId.slice(0, 8)}.`,
        locator: {
          kind: "message",
          source_message_id: `ios-ui-${options.fixtureKey}-m1`,
          sequence: 0,
          speaker_side: "left",
        },
        attribution: { actor_kind: "candidate", status: "confirmed" },
        review_status: "proposed",
        parser: { name: "synthetic-ui-fixture", version: "1.0.0" },
      },
    ],
  };
  const captured = await client.createResourceCapture(captureRequest);
  if (!captured.identity.person_id) {
    throw new Error("The synthetic Person was not bound.");
  }
  let resource = await client.getRelationshipResource(captured.resource.id);
  let evidence = resource.fragments[0];
  if (!evidence) throw new Error("The synthetic evidence fragment is missing.");

  await client.reviewEvidenceFragment(evidence.id, {
    idempotency_key: `${options.fixtureKey}:${runId}:review-evidence`,
    expected_review_status: "proposed",
    expected_last_review_id: null,
    decision: "reviewed",
    reason:
      "The synthetic evaluator matched the excerpt to the visible fixture source.",
  });
  resource = await client.getRelationshipResource(captured.resource.id);
  evidence = resource.fragments[0];
  if (!evidence) throw new Error("The reviewed synthetic fragment is missing.");

  const availability = resource.claim_proposals.find(
    (claim) => claim.field === "availability",
  );
  if (!availability) {
    throw new Error("The synthetic availability proposal is missing.");
  }
  await client.decideAssertion(availability.id, {
    idempotency_key: `${options.fixtureKey}:${runId}:confirm-availability`,
    expected_assertion_version: availability.version,
    decision: "confirm",
  });

  const pursuit = await client.createPursuit({
    idempotency_key: `${options.fixtureKey}:${runId}:pursuit`,
    type: "recruiting",
    title: options.title,
    target_outcome: "accepted_offer",
    target_date: "2026-10-30",
    status: "active",
    milestone: "shortlist_review",
    roles: [
      {
        subject_ref: { type: "person", id: captured.identity.person_id },
        role_type: "candidate",
        status: "active",
        confidence: "confirmed",
        basis_kind: "evidence_supported",
        evidence_refs: [evidence.id],
      },
    ],
    gaps: [
      {
        title: "Client availability for the final conversation is unresolved",
        basis: {
          kind: "evidence_supported",
          summary: "The reviewed candidate message names timing, while the client time remains unconfirmed.",
          evidence_refs: [evidence.id],
        },
        close_condition: "The client confirms one final-conversation time",
      },
    ],
    actions: [
      {
        title: "Ask the client for two final-conversation times",
        owner_user_id: options.ownerUserId,
        status: "drafted",
        due_at: "2026-08-24T09:00:00.000Z",
      },
    ],
  });
  const proposal = await client.stagePursuitProposal(pursuit.pursuit.id, {
    idempotency_key: `${options.fixtureKey}:${runId}:proposal`,
    proposal_id: options.proposalId,
    capture_id: captured.capture_id,
    base_revision: 1,
    summary: "Reviewed evidence may advance the recruiting Pursuit.",
    producer: {
      kind: "agent",
      name: "synthetic-bounded-proposal-worker",
      version: "1.0.0",
      run_id: `TS-IOS-PROPOSAL-UI-${options.fixtureKey.toUpperCase()}`,
    },
    items: [
      {
        item_key: "milestone",
        basis_kind: "evidence_supported",
        epistemic_status: "inference",
        evidence_refs: [evidence.id],
        reason: "The reviewed candidate message names a final conversation.",
        effect_summary: "Would update only the canonical Pursuit milestone.",
        change: {
          kind: "set_milestone",
          proposed_value: "final_conversation",
        },
      },
    ],
  });

  return {
    proposalId: proposal.proposal.id,
    pursuitId: pursuit.pursuit.id,
    personId: captured.identity.person_id,
    captureId: captured.capture_id,
  };
}

async function reviewFixtureFragment(
  client: TalentSignalClient,
  resourceId: string,
  idempotencyKey: string,
  reason: string,
): Promise<void> {
  const resource = await client.getRelationshipResource(resourceId);
  const fragment = resource.fragments[0];
  if (!fragment) {
    throw new Error("The synthetic evidence fragment is missing.");
  }
  if (fragment.review_status !== "proposed") {
    throw new Error(
      `Synthetic evidence must begin as proposed, got ${fragment.review_status}.`,
    );
  }
  const review = await client.reviewEvidenceFragment(fragment.id, {
    idempotency_key: idempotencyKey,
    expected_review_status: "proposed",
    expected_last_review_id: null,
    decision: "reviewed",
    reason,
  });
  if (review.review_status !== "reviewed" || !review.review_id) {
    throw new Error("The synthetic evidence review authority was not recorded.");
  }
}

async function createSameNameFixture(
  client: TalentSignalClient,
): Promise<{
  pursuitId: string;
  firstPersonId: string;
  firstContextId: string;
  firstRoleId: string;
  secondPersonId: string;
  secondContextId: string;
  secondRoleId: string;
  captureIds: string[];
}> {
  const runId = randomUUID();
  const createPerson = async (suffix: "A" | "B") => {
    const resourceId = `ios-same-name:${suffix.toLowerCase()}:${runId}`;
    const observedAt = new Date().toISOString();
    const captured = await client.createResourceCapture({
      contract_version: CONTRACT_VERSION,
      idempotency_key: `ios-same-name:${runId}:${suffix}:capture`,
      channel: "ios_share",
      purpose: `Synthetic same-name identity ${suffix} proof`,
      captured_at: observedAt,
      source_timezone: "Asia/Shanghai",
      person_scope: {
        status: "new_person",
        display_label: "Alex Chen",
        relationship_context: {
          status: "proposed",
          label: `Same-name search ${suffix}`,
          purpose: `Distinguish synthetic identity ${suffix}`,
          role: "Candidate",
        },
        binding_basis: `Synthetic explicit same-name identity ${suffix}.`,
      },
      resource: {
        client_resource_id: resourceId,
        kind: "conversation_transcript",
        display_name: `Synthetic same-name evidence ${suffix}`,
        media_type: "text/plain",
        observed_at: observedAt,
        source_timezone: "Asia/Shanghai",
        source_locator: `synthetic:ios-same-name:${suffix}:${runId}`,
        retention: {
          requested_mode: "ephemeral",
          source_scope: "reviewed_extracted_text",
        },
      },
      fragments: [
        {
          client_resource_id: resourceId,
          kind: "message",
          sequence: 0,
          text: `Synthetic identity ${suffix} source.`,
          locator: {
            kind: "message",
            source_message_id: `same-name-${suffix.toLowerCase()}-m1`,
            sequence: 0,
            speaker_side: "left",
          },
          attribution: { actor_kind: "candidate", status: "confirmed" },
          review_status: "proposed",
          parser: { name: "synthetic-ui-fixture", version: "1.0.0" },
        },
      ],
    });
    if (!captured.identity.person_id || !captured.identity.relationship_context_id) {
      throw new Error(`Same-name identity ${suffix} did not bind.`);
    }
    await reviewFixtureFragment(
      client,
      captured.resource.id,
      `ios-same-name:${runId}:${suffix}:review-evidence`,
      `The evaluator verified synthetic same-name identity ${suffix}.`,
    );
    return {
      personId: captured.identity.person_id,
      contextId: captured.identity.relationship_context_id,
      captureId: captured.capture_id,
    };
  };

  const first = await createPerson("A");
  const second = await createPerson("B");
  const pursuit = await client.createPursuit({
    idempotency_key: `ios-same-name:${runId}:pursuit`,
    type: "recruiting",
    title: "Synthetic same-name search",
    target_outcome: "identity_safe_evidence_review",
    target_date: "2026-10-30",
    status: "active",
    milestone: "evidence_review",
    roles: [first, second].map((person) => ({
      subject_ref: { type: "person" as const, id: person.personId },
      role_type: "candidate",
      status: "active" as const,
      confidence: "confirmed" as const,
      basis_kind: "user_authored" as const,
      evidence_refs: [],
    })),
  });
  const firstRole = pursuit.pursuit.roles.find(
    (role) => role.subject_ref.type === "person" && role.subject_ref.id === first.personId,
  );
  const secondRole = pursuit.pursuit.roles.find(
    (role) => role.subject_ref.type === "person" && role.subject_ref.id === second.personId,
  );
  if (!firstRole || !secondRole) throw new Error("Same-name roles are missing.");
  return {
    pursuitId: pursuit.pursuit.id,
    firstPersonId: first.personId,
    firstContextId: first.contextId,
    firstRoleId: firstRole.id,
    secondPersonId: second.personId,
    secondContextId: second.contextId,
    secondRoleId: secondRole.id,
    captureIds: [first.captureId, second.captureId],
  };
}

async function createContactIdentityFixture(
  client: TalentSignalClient,
): Promise<{
  noMatchEmail: string;
  singleEmail: string;
  singlePersonId: string;
  singleContextId: string;
  conflictEmail: string;
  conflictCurrentPersonId: string;
  conflictCurrentContextId: string;
  conflictHistoricalPersonId: string;
  captureIds: string[];
}> {
  const runId = randomUUID();
  const noMatchEmail = `ios-no-match-${runId}@example.test`;
  const singleEmail = `ios-single-${runId}@example.test`;
  const conflictEmail = `ios-recycled-${runId}@example.test`;

  const createContact = async (
    fixtureKey: string,
    displayLabel: string,
    email: string,
  ) => {
    const observedAt = new Date().toISOString();
    const clientResourceId = `ios-contact-identity:${fixtureKey}:${runId}`;
    const captured = await client.createResourceCapture({
      contract_version: CONTRACT_VERSION,
      idempotency_key: `ios-contact-identity:${fixtureKey}:${runId}:capture`,
      channel: "chat",
      purpose: "Synthetic iOS contact identity review proof",
      captured_at: observedAt,
      source_timezone: "Asia/Shanghai",
      person_scope: {
        status: "new_person",
        display_label: displayLabel,
        relationship_context: {
          status: "proposed",
          label: "Synthetic contact search",
          purpose: "Verify bounded iOS contact attachment",
          role: "Candidate",
        },
        binding_basis:
          "The synthetic evaluator explicitly created this isolated contact identity.",
      },
      resource: {
        client_resource_id: clientResourceId,
        kind: "contact_record",
        display_name: "Synthetic iOS contact record",
        media_type: "text/plain",
        observed_at: observedAt,
        source_timezone: "Asia/Shanghai",
        source_locator: `synthetic:ios-contact:${fixtureKey}:${runId}`,
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
      ],
      fragments: [
        {
          client_resource_id: clientResourceId,
          kind: "contact_field",
          sequence: 0,
          text: `${displayLabel} · ${email}`,
          locator: {
            kind: "contact_field",
            field: "source_note",
            source_record_version: "1",
          },
          attribution: { actor_kind: "recruiter", status: "confirmed" },
          review_status: "proposed",
          parser: { name: "synthetic-ios-contact-fixture", version: "1.0.0" },
        },
      ],
    });
    if (!captured.identity.person_id || !captured.identity.relationship_context_id) {
      throw new Error(`Contact identity ${fixtureKey} did not bind.`);
    }
    await reviewFixtureFragment(
      client,
      captured.resource.id,
      `ios-contact-identity:${fixtureKey}:${runId}:review-evidence`,
      "The evaluator verified the synthetic contact field and identity binding.",
    );
    return {
      personId: captured.identity.person_id,
      contextId: captured.identity.relationship_context_id,
      resourceId: captured.resource.id,
      captureId: captured.capture_id,
    };
  };

  const single = await createContact("single", "Samira Current", singleEmail);
  const historical = await createContact(
    "historical",
    "Robin Historical",
    conflictEmail,
  );

  const pool = new Pool({
    connectionString: fixtureDatabaseUrl(),
    application_name: "talent-signal-ios-contact-fixture",
    max: 2,
  });
  try {
    const due = await pool.query<{ id: string }>(
      `UPDATE identity_handles
       SET valid_until = now() - interval '1 second',
           updated_at = now()
       WHERE source_resource_id = $1
         AND handle_type = 'email'
         AND status = 'confirmed'
       RETURNING id`,
      [historical.resourceId],
    );
    if (!due.rows[0]) {
      throw new Error("The historical contact handle could not be prepared.");
    }
    const expiredIds = await sweepDueIdentityHandles(pool, new Date());
    if (!expiredIds.includes(due.rows[0].id)) {
      throw new Error("The historical contact handle did not expire.");
    }
  } finally {
    await pool.end();
  }

  const current = await createContact(
    "current",
    "Robin Current",
    conflictEmail,
  );

  return {
    noMatchEmail,
    singleEmail,
    singlePersonId: single.personId,
    singleContextId: single.contextId,
    conflictEmail,
    conflictCurrentPersonId: current.personId,
    conflictCurrentContextId: current.contextId,
    conflictHistoricalPersonId: historical.personId,
    captureIds: [single.captureId, historical.captureId, current.captureId],
  };
}

export interface IOSPursuitProposalFixture {
  backend_url: string;
  account_id: string;
  proposal_id: string;
  pursuit_id: string;
  person_id: string;
  recovery_proposal_id: string;
  recovery_pursuit_id: string;
  recovery_person_id: string;
  same_name_pursuit_id: string;
  same_name_first_person_id: string;
  same_name_first_context_id: string;
  same_name_first_role_id: string;
  same_name_second_person_id: string;
  same_name_second_context_id: string;
  same_name_second_role_id: string;
  capture_ids: string[];
  contact_no_match_email?: string;
  contact_single_email?: string;
  contact_single_person_id?: string;
  contact_single_context_id?: string;
  contact_conflict_email?: string;
  contact_conflict_current_person_id?: string;
  contact_conflict_current_context_id?: string;
  contact_conflict_historical_person_id?: string;
}

async function cancelActiveFixturePursuits(
  client: TalentSignalClient,
  pursuitIds: readonly string[],
): Promise<number> {
  let cancelled = 0;
  for (const pursuitId of pursuitIds) {
    const current = await client.getPursuit(pursuitId);
    if (![
      "draft",
      "active",
      "paused",
    ].includes(current.pursuit.status)) {
      continue;
    }
    await client.revisePursuit(pursuitId, {
      idempotency_key: `ios-fixture-retire:${pursuitId}:${current.pursuit.revision}`,
      expected_revision: current.pursuit.revision,
      reason:
        "Retire the completed synthetic iOS journey before preparing the next isolated journey.",
      status: "cancelled",
    });
    cancelled += 1;
  }
  return cancelled;
}

async function activeFixtureCaptureIds(accountId: string): Promise<string[]> {
  const pool = new Pool({
    connectionString: fixtureDatabaseUrl(),
    application_name: "talent-signal-ios-stale-fixture-retirement",
    max: 2,
  });
  try {
    const result = await pool.query<{ id: string; source_locator: string }>(
      `SELECT DISTINCT captures.id, resources.source_locator
       FROM captures
       JOIN source_resources resources
         ON resources.account_id = captures.account_id
        AND resources.capture_id = captures.id
       WHERE captures.account_id = $1
         AND captures.status = 'active'
         AND resources.source_locator LIKE ANY($2::text[])
       ORDER BY captures.id`,
      [
        accountId,
        fixtureCaptureLocatorPrefixes.map((prefix) => `${prefix}%`),
      ],
    );
    return result.rows
      .filter((row) => isIOSPursuitProposalFixtureLocator(row.source_locator))
      .map((row) => row.id);
  } finally {
    await pool.end();
  }
}

async function deleteFixtureCaptures(
  client: TalentSignalClient,
  captureIds: readonly string[],
): Promise<number> {
  let deleted = 0;
  const batchSize = 8;
  for (let start = 0; start < captureIds.length; start += batchSize) {
    const batch = captureIds.slice(start, start + batchSize);
    await Promise.all(
      batch.map(async (captureId) => {
        await client.deleteCapture(captureId, {
          idempotency_key: `ios-fixture-retire-capture:${captureId}`,
          reason:
            "Delete evaluator-owned synthetic iOS fixture evidence after the isolated journey.",
        });
        deleted += 1;
      }),
    );
  }
  return deleted;
}

export async function retireStaleIOSPursuitProposalFixtures(
  fixtureBaseUrl = baseUrl,
): Promise<number> {
  const client = new TalentSignalClient(fixtureBaseUrl);
  const login = await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "ios-pursuit-proposal-stale-fixture-retirement",
  });
  const pursuits = await client.listPursuits();
  const cancelled = await cancelActiveFixturePursuits(
    client,
    pursuits.pursuits
      .filter((pursuit) =>
        isIOSPursuitProposalFixtureTitle(pursuit.title),
      )
      .map((pursuit) => pursuit.id),
  );
  let captureIds: string[];
  try {
    captureIds = await activeFixtureCaptureIds(login.account.id);
  } catch (error) {
    process.stderr.write(
      `Stale iOS fixture capture retirement unavailable: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    return cancelled;
  }
  return cancelled + (await deleteFixtureCaptures(client, captureIds));
}

export async function retireIOSPursuitProposalFixture(
  fixture: IOSPursuitProposalFixture,
  fixtureBaseUrl = baseUrl,
): Promise<void> {
  const client = new TalentSignalClient(fixtureBaseUrl);
  await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "ios-pursuit-proposal-ui-fixture-retirement",
  });

  await cancelActiveFixturePursuits(client, [
    fixture.pursuit_id,
    fixture.recovery_pursuit_id,
    fixture.same_name_pursuit_id,
  ]);
  await deleteFixtureCaptures(client, fixture.capture_ids);
}

export async function prepareIOSPursuitProposalFixture(
  fixtureBaseUrl = baseUrl,
): Promise<IOSPursuitProposalFixture> {
  await retireStaleIOSPursuitProposalFixtures(fixtureBaseUrl);
  const client = new TalentSignalClient(fixtureBaseUrl);
  const login = await client.login({
    account_slug: "fixture-alpha",
    user_email: "recruiter@alpha.local",
    client_label: "ios-pursuit-proposal-ui-fixture",
  });
  const canonical = await createFixture(client, {
    proposalId: process.env.TS_IOS_PROPOSAL_ID ?? randomUUID(),
    fixtureKey: "canonical",
    personLabel: "Leila Hartmann",
    title: "Chief Product Officer · Meridian Labs",
    ownerUserId: login.user.id,
  });
  const recovery = await createFixture(client, {
    proposalId: process.env.TS_IOS_RECOVERY_PROPOSAL_ID ?? randomUUID(),
    fixtureKey: "response-loss",
    personLabel: "Avery Morgan",
    title: "VP Engineering · Northstar",
    ownerUserId: login.user.id,
  });
  const sameName = await createSameNameFixture(client);
  let contactIdentity:
    | Awaited<ReturnType<typeof createContactIdentityFixture>>
    | undefined;
  try {
    contactIdentity = await createContactIdentityFixture(client);
  } catch (error) {
    process.stderr.write(
      `iOS contact identity fixture unavailable: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
  }

  return {
    backend_url: fixtureBaseUrl,
    account_id: login.account.id,
    proposal_id: canonical.proposalId,
    pursuit_id: canonical.pursuitId,
    person_id: canonical.personId,
    recovery_proposal_id: recovery.proposalId,
    recovery_pursuit_id: recovery.pursuitId,
    recovery_person_id: recovery.personId,
    same_name_pursuit_id: sameName.pursuitId,
    same_name_first_person_id: sameName.firstPersonId,
    same_name_first_context_id: sameName.firstContextId,
    same_name_first_role_id: sameName.firstRoleId,
    same_name_second_person_id: sameName.secondPersonId,
    same_name_second_context_id: sameName.secondContextId,
    same_name_second_role_id: sameName.secondRoleId,
    capture_ids: [
      canonical.captureId,
      recovery.captureId,
      ...sameName.captureIds,
      ...(contactIdentity?.captureIds ?? []),
    ],
    ...(contactIdentity
      ? {
          contact_no_match_email: contactIdentity.noMatchEmail,
          contact_single_email: contactIdentity.singleEmail,
          contact_single_person_id: contactIdentity.singlePersonId,
          contact_single_context_id: contactIdentity.singleContextId,
          contact_conflict_email: contactIdentity.conflictEmail,
          contact_conflict_current_person_id:
            contactIdentity.conflictCurrentPersonId,
          contact_conflict_current_context_id:
            contactIdentity.conflictCurrentContextId,
          contact_conflict_historical_person_id:
            contactIdentity.conflictHistoricalPersonId,
        }
      : {}),
  };
}

async function main(): Promise<void> {
  const fixture = await prepareIOSPursuitProposalFixture();
  process.stdout.write(`${JSON.stringify(fixture)}\n`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `iOS Proposal fixture failed: ${error instanceof Error ? error.stack ?? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}
