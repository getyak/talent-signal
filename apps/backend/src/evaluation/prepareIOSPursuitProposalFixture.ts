import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  CONTRACT_VERSION,
  TalentSignalClient,
  type ResourceCaptureRequest,
} from "@talent-signal/contracts";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4317";

async function createFixture(
  client: TalentSignalClient,
  options: {
    proposalId: string;
    fixtureKey: string;
    personLabel: string;
    title: string;
    ownerUserId: string;
  },
): Promise<{ proposalId: string; pursuitId: string; personId: string }> {
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
  };
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
          review_status: "reviewed",
          parser: { name: "synthetic-ui-fixture", version: "1.0.0" },
        },
      ],
    });
    if (!captured.identity.person_id || !captured.identity.relationship_context_id) {
      throw new Error(`Same-name identity ${suffix} did not bind.`);
    }
    return {
      personId: captured.identity.person_id,
      contextId: captured.identity.relationship_context_id,
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
  };
}

export interface IOSPursuitProposalFixture {
  backend_url: string;
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

  for (const pursuitId of [
    fixture.pursuit_id,
    fixture.recovery_pursuit_id,
    fixture.same_name_pursuit_id,
  ]) {
    const current = await client.getPursuit(pursuitId);
    if (!["draft", "active", "paused"].includes(current.pursuit.status)) {
      continue;
    }
    await client.revisePursuit(pursuitId, {
      idempotency_key: `ios-fixture-retire:${pursuitId}:${current.pursuit.revision}`,
      expected_revision: current.pursuit.revision,
      reason: "Retire the completed synthetic iOS journey before preparing the next isolated journey.",
      status: "cancelled",
    });
  }
}

export async function prepareIOSPursuitProposalFixture(
  fixtureBaseUrl = baseUrl,
): Promise<IOSPursuitProposalFixture> {
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

  return {
    backend_url: fixtureBaseUrl,
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
