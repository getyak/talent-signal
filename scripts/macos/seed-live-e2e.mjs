#!/usr/bin/env node

import { randomUUID } from 'node:crypto'

import {
  CONTRACT_VERSION,
  TalentSignalClient,
} from '../../packages/contracts/dist/index.js'

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4317'
const fixtureID = randomUUID()
const clientResourceID = `macos-live-e2e:${fixtureID}`
const sourceAuthorizationExpiresAt = new Date(
  Date.now() + 24 * 60 * 60 * 1_000,
).toISOString()
const client = new TalentSignalClient(baseUrl)

const session = await client.login({
  account_slug: process.env.TS_MACOS_ACCOUNT_SLUG ?? 'fixture-alpha',
  user_email: process.env.TS_MACOS_USER_EMAIL ?? 'recruiter@alpha.local',
  client_label: 'macos-relationship-workbench-live-e2e-seed',
})

const capture = await client.createResourceCapture({
  contract_version: CONTRACT_VERSION,
  idempotency_key: `${fixtureID}:capture`,
  channel: 'api_connector',
  purpose: 'Synthetic native macOS Relationship Workbench E2E scope',
  captured_at: '2026-08-31T05:00:00.000Z',
  source_timezone: 'Asia/Shanghai',
  person_scope: {
    status: 'new_person',
    display_label: `Synthetic macOS relationship ${fixtureID.slice(0, 8)}`,
    relationship_context: {
      status: 'proposed',
      label: 'Synthetic macOS E2E relationship',
      purpose: 'Verify an explicit reviewed Capsule through a governed native Task',
      role: 'Candidate',
    },
    binding_basis: 'The deterministic evaluator explicitly creates this synthetic Person and context.',
  },
  resource: {
    client_resource_id: clientResourceID,
    kind: 'conversation_transcript',
    display_name: 'Synthetic macOS E2E scope evidence',
    media_type: 'text/plain',
    observed_at: '2026-08-31T05:00:00.000Z',
    source_timezone: 'Asia/Shanghai',
    source_locator: `synthetic:macos-live-e2e:${fixtureID}`,
    authorization_expires_at: sourceAuthorizationExpiresAt,
    retention: {
      requested_mode: 'ephemeral',
      source_scope: 'reviewed_selected_text',
    },
  },
  fragments: [
    {
      client_resource_id: clientResourceID,
      kind: 'message',
      sequence: 0,
      text: 'I need the exact remote-work policy before Wednesday because another process moved earlier.',
      locator: {
        kind: 'message',
        source_message_id: `${fixtureID}:scope-message`,
        sequence: 0,
        speaker_side: 'left',
      },
      attribution: { actor_kind: 'candidate', status: 'confirmed' },
      review_status: 'reviewed',
      parser: { name: 'talent-signal-macos-live-e2e-seed', version: '1.0.0' },
    },
  ],
})

if (!capture.identity.person_id || !capture.identity.relationship_context_id) {
  throw new Error('Synthetic seed did not return a bound Person and relationship context.')
}

const resource = await client.getRelationshipResource(capture.resource.id)
const evidence = resource.fragments[0]
if (!evidence) throw new Error('Synthetic seed did not return reviewed evidence.')

const pursuit = await client.createPursuit({
  idempotency_key: `${fixtureID}:pursuit`,
  type: 'recruiting',
  title: 'Synthetic macOS Relationship Workbench E2E',
  target_outcome: 'mutual_final_decision',
  target_date: '2026-10-30',
  status: 'active',
  milestone: 'shortlist_review',
  roles: [
    {
      subject_ref: { type: 'person', id: capture.identity.person_id },
      role_type: 'candidate',
      status: 'active',
      confidence: 'confirmed',
      basis_kind: 'evidence_supported',
      evidence_refs: [evidence.id],
    },
  ],
  actions: [
    {
      title: 'Prepare the exact client policy question',
      owner_user_id: session.user.id,
      status: 'drafted',
      due_at: '2026-09-02T09:00:00.000Z',
    },
  ],
})

process.stdout.write(`${JSON.stringify({
  contract_version: CONTRACT_VERSION,
  environment: 'synthetic loopback backend',
  capture_id: capture.capture_id,
  resource_id: capture.resource.id,
  evidence_fragment_id: evidence.id,
  person_id: capture.identity.person_id,
  relationship_context_id: capture.identity.relationship_context_id,
  pursuit_id: pursuit.pursuit.id,
  pursuit_revision: pursuit.pursuit.revision,
  source_authorization_expires_at: sourceAuthorizationExpiresAt,
  external_effects: [],
}, null, 2)}\n`)
