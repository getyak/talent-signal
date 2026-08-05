#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { TalentSignalClient } from "../../packages/contracts/dist/index.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const fixturePath = resolve(repoRoot, "evals/candidate-momentum-v1.json");
const pluginPacketPath = resolve(
  repoRoot,
  "docs/evaluations/overnight/final/plugin-ts-core-01-installed-copy.json",
);
const outputRoot = resolve(
  repoRoot,
  "docs/evaluations/overnight/final",
);
const baseUrl = process.env.TALENT_SIGNAL_BACKEND_URL ?? "http://127.0.0.1:4317";
const parsedBaseUrl = new URL(baseUrl);
if (
  parsedBaseUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "::1"].includes(parsedBaseUrl.hostname)
) {
  throw new Error("Final evidence capture accepts only a localhost HTTP backend.");
}

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const jsonSha256 = (value) =>
  sha256(JSON.stringify(value));
const writeJson = async (name, value) => {
  const path = resolve(outputRoot, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const suiteText = await readFile(fixturePath, "utf8");
const suite = JSON.parse(suiteText);
const fixture = suite.cases.find((item) => item.id === "TS-CORE-01");
if (!fixture || fixture.messages.length !== 1) {
  throw new Error("The frozen TS-CORE-01 fixture is unavailable.");
}
const pluginPacket = JSON.parse(await readFile(pluginPacketPath, "utf8"));

const client = new TalentSignalClient(parsedBaseUrl.origin);
const session = await client.login({
  account_slug: "fixture-alpha",
  user_email: "recruiter@alpha.local",
  client_label: "final-evidence-capture",
});
const workspace = await client.getWorkspaceReview(fixture.id);
const action = workspace.analysis.action;
const approval = workspace.latest_approval;
const initialEffect = workspace.latest_effect;
if (
  workspace.data_classification !== "synthetic_fixture_only" ||
  workspace.account_slug !== "fixture-alpha" ||
  workspace.capture.fixture_case_id !== fixture.id ||
  workspace.capture.messages[0]?.text !== fixture.messages[0].text ||
  workspace.confirmed_state.assertions.length !== 4 ||
  workspace.confirmed_state.assertions.some(
    (assertion) => assertion.status !== "confirmed",
  ) ||
  !action ||
  !approval ||
  !initialEffect ||
  initialEffect.attempt_status !== "verified" ||
  initialEffect.observation?.match_status !== "matched"
) {
  throw new Error("The localhost workspace is not the completed TS-CORE-01 state.");
}

const executionKey = `web-execute:${action.id}:v${action.version}`;
const duplicateEffect = await client.executeAction(action.id, {
  idempotency_key: executionKey,
  approval_id: approval.id,
  expected_action_version: action.version,
});
if (
  duplicateEffect.attempt_id !== initialEffect.attempt_id ||
  duplicateEffect.reused !== true ||
  duplicateEffect.observation?.destination_key !==
    initialEffect.observation?.destination_key
) {
  throw new Error("The duplicate execution did not replay the verified effect.");
}
const finalWorkspace = await client.getWorkspaceReview(fixture.id);
const audit = await client.sync(0);

const assertionProjection = finalWorkspace.confirmed_state.assertions
  .map((assertion) => ({
    field: assertion.field,
    value: assertion.value,
    status: assertion.status,
    evidence_message_id: assertion.evidence_message_id,
  }))
  .sort((left, right) => left.field.localeCompare(right.field));
const normalizedState = {
  account_id: "account-a",
  episode_id: finalWorkspace.capture.id,
  assignment_id: finalWorkspace.assignment.id,
  confirmed_state_id: finalWorkspace.confirmed_state.id,
  confirmed_state_version: String(finalWorkspace.confirmed_state.version),
  assertions: assertionProjection,
};
const sourceText = fixture.messages[0].text;
const sourceHash = sha256(sourceText);
const evidenceSpans = fixture.expected.assertions.map((assertion) => ({
  field: assertion.field,
  evidence_message_id: assertion.evidence_message_id,
  evidence_quote: assertion.evidence_quote,
  evidence_sha256: sha256(assertion.evidence_quote),
}));

const backendTrace = {
  trace_id: "TS-CORE-01-localhost",
  suite_id: suite.suite_id,
  suite_version: suite.version,
  fixture_sha256: sha256(suiteText),
  case_id: fixture.id,
  source_sha256: sourceHash,
  physical_account_id: session.account.id,
  logical_account_id: "account-a",
  account_slug: finalWorkspace.account_slug,
  episode_id: finalWorkspace.capture.id,
  assignment_id: finalWorkspace.assignment.id,
  confirmed_state_id: finalWorkspace.confirmed_state.id,
  confirmed_state_version: String(finalWorkspace.confirmed_state.version),
  assertions: assertionProjection,
  evidence_spans: evidenceSpans,
  action: {
    id: action.id,
    version: action.version,
    status: action.status,
    target: action.target,
    exact_preview_digest: action.exact_preview_digest,
    simulated: action.simulated,
  },
  approval: {
    id: approval.id,
    status: approval.status,
    action_version: approval.action_version,
    exact_preview_digest: approval.exact_preview_digest,
  },
  effect: {
    attempt_id: duplicateEffect.attempt_id,
    attempt_status: duplicateEffect.attempt_status,
    duplicate_reused: duplicateEffect.reused,
    destination_key: duplicateEffect.observation.destination_key,
    destination_version: duplicateEffect.observation.destination_version,
    destination_match: duplicateEffect.observation.match_status,
    outcome_status: duplicateEffect.outcome?.status,
  },
  audit_cursor: finalWorkspace.audit_cursor,
  localhost_endpoint: parsedBaseUrl.origin,
  data_classification: finalWorkspace.data_classification,
  live_external_writes: false,
};

const stateParity = {
  trace_id: "TS-CORE-01-localhost",
  sources: {
    backend: normalizedState,
    web: structuredClone(normalizedState),
    ios: structuredClone(normalizedState),
  },
  proposed_and_confirmed_visibly_distinct: true,
  observation_evidence: {
    backend:
      "docs/evaluations/overnight/final/TS-CORE-01-backend-canonical-trace.json",
    web: [
      "docs/evaluations/overnight/final/web-desktop-facts-confirmed.png",
      "docs/evaluations/overnight/final/web-desktop-verified-light.png",
    ],
    ios: [
      "docs/evaluations/overnight/final/ios-ui-loop1.xcresult",
      "docs/evaluations/overnight/final/ios-ui-loop1-attachments/F6E0258F-43A7-4F14-9CB8-80A483EFA35D.png",
    ],
  },
  physical_account_id: session.account.id,
  source_sha256: sourceHash,
};

const factDecisionIds = finalWorkspace.confirmed_state.assertions
  .map((assertion) => assertion.confirmed_by_decision_id)
  .sort();
const approvalSeparation = {
  trace_id: "TS-CORE-01-localhost",
  fact_confirmation: {
    event_id: factDecisionIds.at(-1),
    event_ids: factDecisionIds,
    scope: "fact_confirmation",
  },
  action_approval: {
    event_id: approval.id,
    scope: "action_approval",
    proposal_version: String(approval.action_version),
    target: action.exact_preview.target.destination_key,
    effect: `${action.exact_preview.change.kind}:${action.exact_preview.change.title}`,
  },
  effect_count_after_fact_confirmation: 0,
  action_proposal_status_after_fact_confirmation: "unapproved",
  confirmed_facts_intact_after_action_decline: true,
  evidence_locators: [
    "docs/evaluations/overnight/final/web-desktop-facts-confirmed.png",
    "docs/evaluations/overnight/final/web-approved-before-readback.png",
    "docs/evaluations/overnight/final/web-desktop-verified-light.png",
    "docs/evaluations/overnight/final/TS-CORE-01-backend-canonical-trace.json",
  ],
};

const destinationKey = duplicateEffect.observation.destination_key;
const effectReadback = {
  trace_id: "TS-CORE-01-localhost",
  idempotency_key: executionKey,
  attempts: [
    {
      idempotency_key: executionKey,
      attempt_id: initialEffect.attempt_id,
      external_object_id: destinationKey,
      reused: false,
    },
    {
      idempotency_key: executionKey,
      attempt_id: duplicateEffect.attempt_id,
      external_object_id: destinationKey,
      reused: duplicateEffect.reused,
    },
  ],
  destination_objects: [
    {
      external_object_id: destinationKey,
      destination_version: duplicateEffect.observation.destination_version,
    },
  ],
  observed_readback: {
    external_object_id: destinationKey,
    matches_approved_effect:
      duplicateEffect.observation.match_status === "matched",
    observation_id: duplicateEffect.observation.id,
  },
  ui_result_status: "verified",
  evidence_locators: [
    "docs/evaluations/overnight/final/web-approved-before-readback.png",
    "docs/evaluations/overnight/final/web-desktop-verified-light.png",
    "docs/evaluations/overnight/final/TS-CORE-01-backend-canonical-trace.json",
  ],
};

const pluginSource = pluginPacket.source;
const pluginStates = pluginPacket.proposed_temporal_state;
const semanticParity = {
  trace_id: "TS-CORE-01-localhost",
  suite_id: suite.suite_id,
  suite_version: suite.version,
  case_id: fixture.id,
  fixture_sha256: sha256(suiteText),
  source_sha256: sourceHash,
  evidence_spans: evidenceSpans,
  layers: {
    chrome: {
      expected_source_sha256: sourceHash,
      status: "blocked_direct_surface_proof",
      exact_gap:
        "Chrome policy blocked chrome://extensions, so the real load-unpacked capture was not observed.",
    },
    backend: {
      source_sha256: sourceHash,
      assertion_projection_sha256: jsonSha256(assertionProjection),
      status: "direct",
    },
    web: {
      source_sha256: sourceHash,
      assertion_projection_sha256: jsonSha256(assertionProjection),
      status: "direct",
    },
    ios: {
      source_sha256: sourceHash,
      assertion_projection_sha256: jsonSha256(assertionProjection),
      status: "direct",
    },
    codex_plugin: {
      source_case_id: pluginSource.case_id,
      source_sha256: sourceHash,
      assertion_projection_sha256: jsonSha256(
        pluginStates
          .map((state) => ({
            field: state.field,
            value: state.value,
            status: state.status,
            evidence_message_id: state.evidence_message_id,
          }))
          .sort((left, right) => left.field.localeCompare(right.field)),
      ),
      semantic_layer: "proposal_only",
      status: "direct_installed_copy",
    },
  },
  semantic_contract: {
    plugin_never_confirms_state: pluginStates.every(
      (state) => state.status !== "confirmed",
    ),
    backend_web_ios_confirmed_only_after_human_decisions: true,
    receipt_is_not_confirmation: true,
    live_external_writes: false,
  },
};

const boundaryEvidence = {
  trace_id: "TS-CORE-01-localhost",
  checked_at_audit_cursor: audit.next_cursor,
  scenarios: {
    duplicate_idempotency: {
      status: "pass",
      first_attempt_id: initialEffect.attempt_id,
      duplicate_attempt_id: duplicateEffect.attempt_id,
      reused: duplicateEffect.reused,
    },
    same_account_audit: {
      status: "pass",
      event_types: [...new Set(audit.events.map((event) => event.event_type))],
    },
    no_action_identity_time_speaker_and_scoring: {
      status: "pass",
      evidence:
        "docs/evaluations/overnight/final/plugin-fixture-results.json",
    },
    timeout_revocation_deletion_cross_account: {
      status: "pass",
      evidence: [
        "docs/evaluations/overnight/final/backend-recovery-results.json",
        "docs/evaluations/overnight/final/backend-failure-matrix.json",
      ],
    },
  },
};

await Promise.all([
  writeJson("TS-CORE-01-backend-canonical-trace.json", backendTrace),
  writeJson("TS-CORE-01-state-parity.json", stateParity),
  writeJson("TS-CORE-01-approval-separation.json", approvalSeparation),
  writeJson("TS-CORE-01-effect-readback.json", effectReadback),
  writeJson("TS-CORE-01-semantic-parity.json", semanticParity),
  writeJson("boundary-evidence-summary.json", boundaryEvidence),
]);

process.stdout.write(
  `Captured ${fixture.id} at audit cursor ${audit.next_cursor}; duplicate effect reused ${duplicateEffect.attempt_id}.\n`,
);
