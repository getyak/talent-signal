import "server-only";

import {
  CONTRACT_VERSION,
  SIMULATED_CAPABILITY,
  TalentSignalClient,
  TalentSignalHttpError,
  type AssertionDecisionRequest,
  type DeleteCaptureResponse,
  type DeletionLineageResponse,
  type EffectResultResponse,
  type SimulatedEffectPreview,
  type SourceRetentionReceipt,
  type SubmitAnalysisProposalRequest,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";

import {
  candidateMomentumFixtures,
  type CandidateMomentumCase,
} from "../candidateMomentum";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);
const LOCAL_ACCOUNT_SLUG = "fixture-alpha";
const LOCAL_USER_EMAIL = "recruiter@alpha.local";
const TS_CORE_01 = "TS-CORE-01";

export type BrowserHandoffEnvelope = {
  schema_version: "browser-capture-handoff.v1";
  request_id: string;
  idempotency_key: string;
  purpose: "candidate_conversation_evidence_review";
  retention_mode: "ephemeral" | "evidence_crop" | "full_source";
  handoff_target: string;
  session: {
    version: string | null;
    credential_transport: "browser_managed";
  };
  source: {
    capture_kind: "selected_text" | "visible_tab";
    title: string;
    url: string;
    captured_at: string;
  };
  review: {
    type: "reviewed_text";
    text: string;
    edited_from_selection: boolean;
  } | {
    type: "reviewed_image";
    mime_type: "image/jpeg";
    width: number;
    height: number;
    data_url: string;
    edits: {
      crop_percent: Record<string, number>;
      redactions_percent: Array<Record<string, number>>;
    };
  };
  authorization: {
    decision: "submit_reviewed_capture";
    approved_at: string;
    statement: string;
  };
};

function backendBaseUrl(): string {
  const configured =
    process.env.TALENT_SIGNAL_BACKEND_URL?.trim() ??
    "http://127.0.0.1:4317";
  const parsed = new URL(configured);
  if (
    parsed.protocol !== "http:" ||
    !LOCAL_HOSTNAMES.has(parsed.hostname)
  ) {
    throw new Error("The integration backend must be a localhost HTTP URL.");
  }
  return parsed.origin;
}

function fixtureCase(caseId: string): CandidateMomentumCase {
  const selected = candidateMomentumFixtures.cases.find(
    (item) => item.id === caseId,
  );
  if (!selected) {
    throw new Error(`Missing frozen fixture ${caseId}.`);
  }
  return selected;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function authenticatedClient(clientLabel: string) {
  const client = new TalentSignalClient(backendBaseUrl());
  const session = await client.login({
    account_slug: LOCAL_ACCOUNT_SLUG,
    user_email: LOCAL_USER_EMAIL,
    client_label: clientLabel,
  });
  return { client, session };
}

function assertSyntheticBrowserHandoff(
  value: unknown,
  headers: {
    idempotencyKey: string | null;
    sessionVersion: string | null;
  },
): asserts value is BrowserHandoffEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("The reviewed handoff body is required.");
  }
  const envelope = value as Partial<BrowserHandoffEnvelope>;
  const frozen = fixtureCase(TS_CORE_01);
  if (
    typeof envelope.idempotency_key !== "string" ||
    headers.idempotencyKey !== envelope.idempotency_key
  ) {
    throw new TalentSignalHttpError(
      400,
      "idempotency_key_mismatch",
      "The Idempotency-Key header must match the reviewed handoff packet.",
      null,
    );
  }
  if (
    envelope.session?.version &&
    headers.sessionVersion !== envelope.session.version
  ) {
    throw new TalentSignalHttpError(
      409,
      "session_stale",
      "The reviewed handoff session version changed before Submit.",
      null,
    );
  }
  if (envelope.source?.capture_kind === "visible_tab") {
    throw new TalentSignalHttpError(
      422,
      "source_transport_unsupported",
      "The localhost backend cannot yet govern visible-tab image assets. Submit reviewed selected text instead.",
      { capture_kind: "visible_tab" },
    );
  }
  if (envelope.retention_mode === "full_source") {
    throw new TalentSignalHttpError(
      422,
      "retention_mode_unsupported",
      "Selected text is not a complete reviewed source, so full-source retention is unavailable.",
      {
        capture_kind: envelope.source?.capture_kind,
        retention_mode: envelope.retention_mode,
      },
    );
  }
  if (
    !["ephemeral", "evidence_crop"].includes(
      envelope.retention_mode ?? "",
    )
  ) {
    throw new TalentSignalHttpError(
      422,
      "retention_mode_unsupported",
      "The requested source-retention mode is not supported for this transport.",
      null,
    );
  }
  const expectedText = frozen.messages[0]?.text;
  if (
    envelope.schema_version !== "browser-capture-handoff.v1" ||
    typeof envelope.request_id !== "string" ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(envelope.request_id) ||
    envelope.idempotency_key.length > 128 ||
    envelope.purpose !== "candidate_conversation_evidence_review" ||
    envelope.session?.credential_transport !== "browser_managed" ||
    envelope.review?.type !== "reviewed_text" ||
    envelope.review.text !== expectedText ||
    envelope.authorization?.decision !== "submit_reviewed_capture"
  ) {
    throw new Error(
      "Only the exact reviewed TS-CORE-01 synthetic selected text is accepted.",
    );
  }
}

function analysisRequest(
  frozen: CandidateMomentumCase,
): SubmitAnalysisProposalRequest {
  const action = frozen.expected.action;
  return {
    idempotency_key: `browser-analysis:${TS_CORE_01}`,
    producer: {
      kind: "fixture_compiler" as const,
      name: "browser-reviewed-candidate-momentum-v1",
      version: candidateMomentumFixtures.version,
    },
    disposition: frozen.expected.disposition,
    assertions: frozen.expected.assertions.map((assertion) => ({
      field:
        assertion.field as SubmitAnalysisProposalRequest["assertions"][number]["field"],
      status: assertion.status,
      value: assertion.value,
      evidence_message_id: assertion.evidence_message_id,
      evidence_quote: assertion.evidence_quote,
      subject_kind: "candidate" as const,
      temporal_relation: "new" as const,
    })),
    action: action
      ? {
          type: action.type,
          owner: action.owner,
          target: action.target,
          reason: action.reason,
          due: action.due,
          evidence_message_ids: action.evidence_message_ids,
          effect_preview: {
            simulated: true as const,
            capability: "local.simulated_attention.create" as const,
            adapter: "local_deterministic" as const,
            target: {
              destination_key: "fixture:ts-core-01:integration-attention",
              label: "Local simulated recruiter attention queue",
            },
            change: {
              kind: "create_attention" as const,
              title: `Prepare question: ${action.target}`,
            },
            expected_destination_version: 0,
            simulation_behavior: "success" as const,
          },
        }
      : null,
  };
}

export function isIntegrationMode(): boolean {
  return process.env.TALENT_SIGNAL_INTEGRATION_MODE === "true";
}

export async function localSessionStatus() {
  const { session } = await authenticatedClient("web-session-check");
  return {
    status: "ready" as const,
    workspace_label: `${session.account.name} · Local simulation`,
    session_version: `${CONTRACT_VERSION}:${session.account.id}`,
    account_id: session.account.id,
  };
}

export async function submitBrowserHandoff(
  value: unknown,
  headers: {
    idempotencyKey: string | null;
    sessionVersion: string | null;
  },
): Promise<{
  capture_id: string;
  receipt_id: string;
  proposal_count: number;
  retention: SourceRetentionReceipt;
  status: "received";
}> {
  assertSyntheticBrowserHandoff(value, headers);
  const envelope = value;
  const frozen = fixtureCase(TS_CORE_01);
  const candidate = frozen.context.candidate;
  const assignment = frozen.context.assignment;
  if (!candidate || !assignment) {
    throw new Error("TS-CORE-01 must have a bound synthetic identity.");
  }

  const { client } = await authenticatedClient("chrome-extension-handoff");
  const capture = await client.createCapture({
    idempotency_key: `browser-handoff:${envelope.request_id}`,
    fixture_case_id: frozen.id,
    source: {
      kind: "transcript",
      captured_at: new Date(frozen.context.captured_at).toISOString(),
      source_timezone: frozen.context.source_timezone,
      purpose:
        "Synthetic TS-CORE-01 selected-text capture approved in the local browser extension",
      source_locator: `browser-extension-request:${envelope.request_id}`,
      retention: {
        requested_mode: envelope.retention_mode,
        source_scope: "reviewed_selected_text",
      },
    },
    identity: {
      status: "bound",
      external_ref: `fixture:person:${slug(candidate)}`,
      display_label: candidate,
      assignment_ref: `fixture:assignment:${slug(candidate)}:${slug(assignment)}`,
      assignment_label: assignment,
      binding_basis:
        "Exact frozen TS-CORE-01 context selected and approved by the simulated recruiter.",
    },
    messages: frozen.messages.map((message, sequence) => ({
      source_message_id: message.id,
      sequence,
      speaker: message.speaker,
      text: envelope.review.type === "reviewed_text"
        ? envelope.review.text
        : message.text,
    })),
  });
  const proposal = await client.submitAnalysis(
    capture.id,
    analysisRequest(frozen),
  );
  const retention = await client.getSourceRetentionReceipt(capture.id);
  return {
    capture_id: capture.id,
    receipt_id: capture.id,
    proposal_count: proposal.assertions.length,
    retention,
    status: "received",
  };
}

export async function loadBrowserReceipt(
  requestId: string,
): Promise<SourceRetentionReceipt> {
  const { client } = await authenticatedClient(
    "chrome-extension-receipt-readback",
  );
  return client.getSourceRetentionReceiptByLocator(
    `browser-extension-request:${requestId}`,
  );
}

export async function loadBackendWorkspace(
  clientLabel = "web-workspace",
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient(clientLabel);
  return client.getWorkspaceReview(TS_CORE_01);
}

export async function decideBackendAssertion(
  assertionId: string,
  request: AssertionDecisionRequest,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-fact-review");
  await client.decideAssertion(assertionId, request);
  return client.getWorkspaceReview(TS_CORE_01);
}

export async function approveBackendAction(
  actionId: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-action-approval");
  const workspace = await client.getWorkspaceReview(TS_CORE_01);
  const action = workspace.analysis.action;
  if (!action || action.id !== actionId) {
    throw new Error("The current synthetic action proposal was not found.");
  }
  await client.approveAction(action.id, {
    idempotency_key: `web-approve:${action.id}:v${action.version}`,
    expected_action_version: action.version,
    exact_preview: action.exact_preview,
  });
  return client.getWorkspaceReview(TS_CORE_01);
}

export async function executeBackendAction(
  actionId: string,
): Promise<{
  effect: EffectResultResponse;
  workspace: WorkspaceReviewResponse;
}> {
  const { client } = await authenticatedClient("web-action-execution");
  const workspace = await client.getWorkspaceReview(TS_CORE_01);
  const action = workspace.analysis.action;
  const approval = workspace.latest_approval;
  if (
    !action ||
    action.id !== actionId ||
    !approval ||
    approval.status !== "active"
  ) {
    throw new Error("A current exact approval is required before execution.");
  }
  const effect = await client.executeAction(action.id, {
    idempotency_key: `web-execute:${action.id}:v${action.version}`,
    approval_id: approval.id,
    expected_action_version: action.version,
  });
  return {
    effect,
    workspace: await client.getWorkspaceReview(TS_CORE_01),
  };
}

export async function reconcileBackendEffect(
  attemptId: string,
): Promise<{
  effect: EffectResultResponse;
  workspace: WorkspaceReviewResponse;
}> {
  const { client } = await authenticatedClient("web-effect-reconciliation");
  const effect = await client.reconcileEffect(attemptId, {
    idempotency_key: `web-reconcile:${attemptId}`,
  });
  return {
    effect,
    workspace: await client.getWorkspaceReview(TS_CORE_01),
  };
}

export async function revokeBackendApproval(
  approvalId: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-approval-revocation");
  await client.revokeApproval(approvalId, {
    idempotency_key: `web-revoke-approval:${approvalId}`,
    reason: "Recruiter cancelled the synthetic local effect approval.",
  });
  return client.getWorkspaceReview(TS_CORE_01);
}

export async function revokeBackendCapability(): Promise<{
  capability: string;
  status: "revoked";
}> {
  const { client } = await authenticatedClient("web-capability-revocation");
  return client.revokeCapability({
    idempotency_key: "web-revoke:local-simulated-attention",
    capability: SIMULATED_CAPABILITY,
    reason: "Round-2 Web recovery proof before local effect execution.",
  });
}

export type IntegrationRevisionVariant =
  | "stale_approval"
  | "timeout_after_effect";

function revisedPreview(
  current: SimulatedEffectPreview,
  variant: IntegrationRevisionVariant,
): SimulatedEffectPreview {
  if (variant === "timeout_after_effect") {
    return {
      ...current,
      simulation_behavior: "timeout_after_write",
    };
  }
  return {
    ...current,
    change: {
      ...current.change,
      title: `${current.change.title} — revised`,
    },
  };
}

export async function reviseBackendActionForEvaluation(
  actionId: string,
  variant: IntegrationRevisionVariant,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-action-revision");
  const workspace = await client.getWorkspaceReview(TS_CORE_01);
  const action = workspace.analysis.action;
  if (!action || action.id !== actionId) {
    throw new Error("The current synthetic action proposal was not found.");
  }
  await client.reviseAction(action.id, {
    idempotency_key: `web-revise:${action.id}:v${action.version}:${variant}`,
    expected_action_version: action.version,
    exact_preview: revisedPreview(action.exact_preview, variant),
    reason:
      variant === "timeout_after_effect"
        ? "Exercise truthful unknown-result reconciliation."
        : "Exercise stale approval after an exact preview change.",
  });
  return client.getWorkspaceReview(TS_CORE_01);
}

export async function deleteBackendCapture(
  captureId: string,
): Promise<{
  deletion: DeleteCaptureResponse;
  lineage: DeletionLineageResponse;
}> {
  const { client } = await authenticatedClient("web-source-deletion");
  const deletion = await client.deleteCapture(captureId, {
    idempotency_key: `web-delete:${captureId}`,
    reason: "Recruiter requested deletion of the synthetic local source.",
  });
  return {
    deletion,
    lineage: await client.getDeletionLineage(deletion.deletion_id),
  };
}
