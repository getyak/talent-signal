import "server-only";

import { createHash } from "node:crypto";

import {
  CONTRACT_VERSION,
  SIMULATED_CAPABILITY,
  TalentSignalClient,
  TalentSignalHttpError,
  type AssertionDecisionRequest,
  type AssertionDecisionResponse,
  type ChatTaskResponse,
  type CaptureIdentityCorrectionRequest,
  type CaptureIdentityCorrectionResponse,
  type DeleteCaptureResponse,
  type DeletionLineageResponse,
  type EffectResultResponse,
  type EffectReversalPreview,
  type PersonDirectoryResponse,
  type PersonMergePreview,
  type PersonMergeRequest,
  type PersonMergeResponse,
  type PersonMergeReversalRequest,
  type PersonMergeReversalPreview,
  type PublicResearchResponse,
  type EvidenceFragmentInput,
  type EvidenceFragmentReviewRequest,
  type EvidenceFragmentReviewResponse,
  type IdentityResolutionCase,
  type IdentityResolutionDecisionRequest,
  type IdentityResolutionDecisionResponse,
  type KnowledgeSnapshot,
  type RelationshipResourceDetail,
  type RelationshipResourceListResponse,
  type RelationshipAgentHistory,
  type RelationshipScope,
  type ResourceCaptureResponse,
  type ResourceCaptureRequest,
  type SimulatedEffectPreview,
  type SourceRetentionReceipt,
  type SourceAuthorizationDecisionRequest,
  type SourceAuthorizationDecisionResponse,
  type SubmitAnalysisProposalRequest,
  type WorkspaceReviewResponse,
} from "@talent-signal/contracts";

import {
  candidateMomentumFixtures,
  type CandidateMomentumCase,
} from "../candidateMomentum";
import {
  validateScreenshotAnalysisMeta,
  validateScreenshotCaptureDraft,
  validateReviewedScreenshotEdit,
  type ScreenshotAnalysisMeta,
  type ScreenshotCaptureDraft,
} from "../screenshot-capture";
import { verifyScreenshotAnalysisReceipt } from "./screenshot-analysis-receipt";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "::1", "localhost"]);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function stableRef(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function readWorkspace(
  client: TalentSignalClient,
  captureId?: string,
) {
  return captureId
    ? client.getWorkspaceReviewByCapture(captureId)
    : client.getWorkspaceReview(TS_CORE_01);
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
  const configured = process.env.TALENT_SIGNAL_INTEGRATION_MODE;
  return (
    configured === "true" ||
    (process.env.NODE_ENV !== "production" && configured !== "false")
  );
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
      channel: "browser_extension",
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
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient(clientLabel);
  return readWorkspace(client, captureId);
}

export async function loadPeopleDirectory(
  query = "",
): Promise<PersonDirectoryResponse> {
  const { client } = await authenticatedClient("web-people-directory");
  return client.listPeople(query);
}

export async function searchPeopleDirectory(
  query: string,
): Promise<PersonDirectoryResponse> {
  const { client } = await authenticatedClient(
    "web-people-directory-search",
  );
  return client.searchPeople(query);
}

export async function loadIdentityResolutionCase(
  caseId: string,
): Promise<IdentityResolutionCase> {
  const { client } = await authenticatedClient(
    "web-identity-resolution-case",
  );
  return client.getIdentityResolutionCase(caseId);
}

export type IdentityResolutionWorkflowResult = {
  decision: IdentityResolutionDecisionResponse;
  identity_case: IdentityResolutionCase;
  compilation: KnowledgeSnapshot | null;
  compilation_error: string | null;
};

export async function decideIdentityResolution(
  caseId: string,
  request: IdentityResolutionDecisionRequest,
): Promise<IdentityResolutionWorkflowResult> {
  const { client } = await authenticatedClient(
    "web-identity-resolution-decision",
  );
  const decision = await client.decideIdentityResolutionCase(
    caseId,
    request,
  );
  const identityCase = await client.getIdentityResolutionCase(caseId);
  if (
    decision.identity_status !== "bound" ||
    !decision.person_id ||
    !decision.relationship_context_id
  ) {
    return {
      decision,
      identity_case: identityCase,
      compilation: null,
      compilation_error: null,
    };
  }
  try {
    const compilation = await client.compileKnowledge(
      decision.person_id,
      decision.relationship_context_id,
      {
        idempotency_key:
          `identity-case:${caseId}:version:${decision.case_version}`,
        objective:
          "Recompile the selected relationship after explicit identity resolution.",
      },
    );
    return {
      decision,
      identity_case: identityCase,
      compilation,
      compilation_error: null,
    };
  } catch {
    return {
      decision,
      identity_case: identityCase,
      compilation: null,
      compilation_error:
        "Identity was resolved, but the derived Wiki did not recompile. The governed source remains bound and compilation can be retried.",
    };
  }
}

type CommitRelationshipResourceCommon = {
  request_id: string;
  captured_at: string;
  channel: "chat" | "web_upload";
  kind: ResourceCaptureRequest["resource"]["kind"];
  display_name: string;
  media_type: string;
  confirmed_identity_handles?: NonNullable<
    ResourceCaptureRequest["confirmed_identity_handles"]
  >;
  byte_size?: number;
  content_hash?: string;
  source_locator?: string;
  discovered_from_resource_id?: string;
  fragments: EvidenceFragmentInput[];
};

export type CommitRelationshipResourceInput =
  CommitRelationshipResourceCommon &
    (
      | {
          person_id: string;
          relationship_context_id: string;
          person_scope?: never;
        }
      | {
          person_scope: ResourceCaptureRequest["person_scope"];
          person_id?: never;
          relationship_context_id?: never;
        }
    );

export async function commitRelationshipResource(
  input: CommitRelationshipResourceInput,
): Promise<ResourceCaptureResponse> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(input.request_id) ||
    ("person_id" in input &&
      (!input.person_id ||
        !input.relationship_context_id ||
        !uuid.test(input.person_id) ||
        !uuid.test(input.relationship_context_id))) ||
    input.display_name.trim().length === 0 ||
    input.display_name.length > 240 ||
    input.media_type.trim().length === 0 ||
    input.media_type.length > 120 ||
    input.fragments.length === 0 ||
    input.fragments.length > 300 ||
    (input.discovered_from_resource_id !== undefined &&
      !uuid.test(input.discovered_from_resource_id))
  ) {
    throw new Error("The governed resource intake is incomplete.");
  }
  const capturedAt = input.captured_at;
  if (new Date(capturedAt).toISOString() !== capturedAt) {
    throw new Error("The governed resource observation time is invalid.");
  }
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  const clientResourceId = `web-resource:${input.request_id}`;
  if (
    input.fragments.some(
      (fragment) => fragment.client_resource_id !== clientResourceId,
    )
  ) {
    throw new Error("The resource fragments are bound to another intake.");
  }
  const sourceScope =
    input.kind === "resume" || input.kind === "document"
      ? "reviewed_extracted_text"
      : "reviewed_selected_text";
  const { client } = await authenticatedClient(
    `web-resource-${input.kind}`,
  );
  const personScope: ResourceCaptureRequest["person_scope"] =
    "person_scope" in input && input.person_scope
      ? input.person_scope
      : {
          status: "confirmed",
          person_id: input.person_id as string,
          relationship_context: {
            status: "existing",
            relationship_context_id:
              input.relationship_context_id as string,
          },
          binding_basis:
            "The signed-in recruiter submitted this resource from the visible person and relationship context.",
        };
  return client.createResourceCapture({
    contract_version: CONTRACT_VERSION,
    idempotency_key: `web-resource:${input.request_id}`,
    channel: input.channel,
    purpose:
      input.kind === "personal_note"
        ? "Preserve a recruiter-authored note in the selected relationship context"
        : input.kind === "public_url"
          ? "Save a recruiter-selected public URL as an unexecuted research seed"
          : input.kind === "conversation_transcript"
            ? "Attach a recruiter-reviewed conversation transcript for evidence and fact review"
          : "Attach extracted document evidence to the selected relationship context",
    captured_at: capturedAt,
    source_timezone: timezone,
    person_scope: personScope,
    ...(input.confirmed_identity_handles
      ? {
          confirmed_identity_handles:
            input.confirmed_identity_handles,
        }
      : {}),
    resource: {
      client_resource_id: clientResourceId,
      kind: input.kind,
      display_name: input.display_name.trim(),
      media_type: input.media_type.trim(),
      observed_at: capturedAt,
      source_timezone: timezone,
      ...(input.byte_size === undefined
        ? {}
        : { byte_size: input.byte_size }),
      ...(input.content_hash
        ? { content_hash: input.content_hash }
        : {}),
      ...(input.source_locator
        ? { source_locator: input.source_locator }
        : {}),
      ...(input.discovered_from_resource_id
        ? {
            discovered_from_resource_id:
              input.discovered_from_resource_id,
            discovered_from_client_resource_id: "parent-governed-resource",
          }
        : {}),
      retention: {
        requested_mode: "ephemeral",
        source_scope: sourceScope,
      },
    },
    fragments: input.fragments,
  });
}

export async function loadRelationshipScope(
  personId: string,
  relationshipContextId: string,
): Promise<RelationshipScope> {
  const { client } = await authenticatedClient(
    "web-relationship-scope",
  );
  return client.getRelationshipScope(personId, relationshipContextId);
}

export type PersonMergeCompilationReceipt = {
  relationship_context_id: string;
  person_id: string;
  status: KnowledgeSnapshot["status"] | "failed";
  knowledge_snapshot_id: string | null;
  error: string | null;
};

export type PersonMergeWorkflowResult = PersonMergeResponse & {
  compilations: PersonMergeCompilationReceipt[];
};

export async function previewRelationshipPersonMerge(
  sourcePersonId: string,
  targetPersonId: string,
): Promise<PersonMergePreview> {
  if (
    !UUID.test(sourcePersonId) ||
    !UUID.test(targetPersonId) ||
    sourcePersonId === targetPersonId
  ) {
    throw new TalentSignalHttpError(
      400,
      "person_merge_scope_invalid",
      "Choose two different active people for merge review.",
      null,
    );
  }
  const { client } = await authenticatedClient(
    "web-person-merge-preview",
  );
  return client.previewPersonMerge(sourcePersonId, targetPersonId);
}

async function compilePersonMergeContexts(
  client: TalentSignalClient,
  merge: PersonMergeResponse,
): Promise<PersonMergeCompilationReceipt[]> {
  const movedContexts = new Set(
    merge.affected_relationship_context_ids,
  );
  const pending = [
    ...merge.relationship_context_ids_requiring_recompilation,
  ];
  const receipts: PersonMergeCompilationReceipt[] = [];
  while (pending.length > 0) {
    const batch = pending.splice(0, 6);
    receipts.push(
      ...(await Promise.all(
        batch.map(async (relationshipContextId) => {
          const personId =
            merge.status === "reversed" &&
            movedContexts.has(relationshipContextId)
              ? merge.source_person_id
              : merge.target_person_id;
          try {
            const snapshot = await client.compileKnowledge(
              personId,
              relationshipContextId,
              {
                idempotency_key:
                  `person-merge:${merge.operation_id}:${merge.status}:${relationshipContextId}`,
                objective:
                  merge.status === "applied"
                    ? "Recompile this relationship after the recruiter confirmed a reversible person merge"
                    : "Recompile this relationship after the recruiter reversed a person merge",
              },
            );
            return {
              relationship_context_id: relationshipContextId,
              person_id: personId,
              status: snapshot.status,
              knowledge_snapshot_id: snapshot.id,
              error: null,
            } satisfies PersonMergeCompilationReceipt;
          } catch (caught) {
            return {
              relationship_context_id: relationshipContextId,
              person_id: personId,
              status: "failed",
              knowledge_snapshot_id: null,
              error:
                caught instanceof Error
                  ? caught.message
                  : "This relationship Wiki could not be recompiled.",
            } satisfies PersonMergeCompilationReceipt;
          }
        }),
      )),
    );
  }
  return receipts;
}

export async function mergeRelationshipPeople(
  request: PersonMergeRequest,
): Promise<PersonMergeWorkflowResult> {
  const { client } = await authenticatedClient("web-person-merge");
  const merge = await client.mergePeople(request);
  return {
    ...merge,
    compilations: await compilePersonMergeContexts(client, merge),
  };
}

export async function reverseRelationshipPersonMerge(
  operationId: string,
  request: PersonMergeReversalRequest,
): Promise<PersonMergeWorkflowResult> {
  if (!UUID.test(operationId)) {
    throw new TalentSignalHttpError(
      400,
      "person_merge_operation_invalid",
      "The merge operation identifier is invalid.",
      null,
    );
  }
  const { client } = await authenticatedClient(
    "web-person-merge-reversal",
  );
  const merge = await client.reversePersonMerge(operationId, request);
  return {
    ...merge,
    compilations: await compilePersonMergeContexts(client, merge),
  };
}

export async function loadPersonMergeReversalPreview(
  operationId: string,
): Promise<PersonMergeReversalPreview> {
  if (!UUID.test(operationId)) {
    throw new TalentSignalHttpError(
      400,
      "person_merge_operation_invalid",
      "The merge operation identifier is invalid.",
      null,
    );
  }
  const { client } = await authenticatedClient(
    "web-person-merge-reversal-preview",
  );
  return client.getPersonMergeReversalPreview(operationId);
}

export async function loadRelationshipAgentHistory(
  personId: string,
  relationshipContextId: string,
): Promise<RelationshipAgentHistory> {
  const { client } = await authenticatedClient(
    "web-relationship-agent-history",
  );
  return client.getRelationshipAgentHistory(
    personId,
    relationshipContextId,
  );
}

export async function loadRelationshipWiki(
  personId: string,
  relationshipContextId: string,
): Promise<KnowledgeSnapshot> {
  const { client } = await authenticatedClient(
    "web-relationship-wiki",
  );
  return client.getKnowledge(personId, relationshipContextId);
}

export async function loadRelationshipResources(
  personId: string,
  relationshipContextId: string,
): Promise<RelationshipResourceListResponse> {
  const { client } = await authenticatedClient(
    "web-relationship-resources",
  );
  return client.listRelationshipResources(
    personId,
    relationshipContextId,
  );
}

export async function loadRelationshipResource(
  resourceId: string,
): Promise<RelationshipResourceDetail> {
  const { client } = await authenticatedClient(
    "web-relationship-resource-detail",
  );
  return client.getRelationshipResource(resourceId);
}

export async function reviewRelationshipEvidence(
  fragmentId: string,
  request: EvidenceFragmentReviewRequest,
): Promise<EvidenceFragmentReviewResponse> {
  const { client } = await authenticatedClient(
    "web-evidence-fragment-review",
  );
  return client.reviewEvidenceFragment(fragmentId, request);
}

export type RunRelationshipResearchInput = {
  request_id: string;
  person_id: string;
  relationship_context_id: string;
  seed_resource_id: string;
  expected_seed_url: string;
  allowed_domain: string;
  maximum_page_count: number;
  maximum_link_depth: number;
};

export async function runRelationshipResearch(
  input: RunRelationshipResearchInput,
): Promise<PublicResearchResponse> {
  let expectedUrl: URL;
  try {
    expectedUrl = new URL(input.expected_seed_url);
  } catch {
    throw new Error("The public research seed URL is invalid.");
  }
  if (
    !UUID.test(input.request_id) ||
    !UUID.test(input.person_id) ||
    !UUID.test(input.relationship_context_id) ||
    !UUID.test(input.seed_resource_id) ||
    expectedUrl.protocol !== "https:" ||
    expectedUrl.hostname.toLowerCase() !==
      input.allowed_domain.trim().toLowerCase() ||
    !Number.isInteger(input.maximum_page_count) ||
    input.maximum_page_count < 1 ||
    input.maximum_page_count > 5 ||
    !Number.isInteger(input.maximum_link_depth) ||
    input.maximum_link_depth < 0 ||
    input.maximum_link_depth > 1
  ) {
    throw new Error("The approved public research scope is incomplete.");
  }
  const { client } = await authenticatedClient(
    "web-public-research",
  );
  return client.runPublicResearch({
    idempotency_key: `web-research:${input.request_id}`,
    person_id: input.person_id,
    relationship_context_id: input.relationship_context_id,
    seed_resource_id: input.seed_resource_id,
    purpose:
      "Retrieve a bounded public page snapshot for recruiter review in the selected relationship context",
    expected_seed_url: expectedUrl.toString(),
    authorization: {
      decision: "approve_public_research",
      allowed_domain: input.allowed_domain.trim().toLowerCase(),
      maximum_page_count: input.maximum_page_count,
      maximum_link_depth: input.maximum_link_depth,
    },
  });
}

export async function getLatestRelationshipResearch(
  seedResourceId: string,
): Promise<PublicResearchResponse | null> {
  if (!UUID.test(seedResourceId)) {
    throw new Error("The public research seed resource is invalid.");
  }
  const { client } = await authenticatedClient(
    "web-public-research-status",
  );
  return client.getLatestPublicResearchTask(seedResourceId);
}

export type AskRelationshipChatInput = {
  request_id: string;
  person_id: string;
  relationship_context_id: string;
  objective: string;
};

export async function askRelationshipChat(
  input: AskRelationshipChatInput,
): Promise<ChatTaskResponse> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.request_id,
    ) ||
    !/^[0-9a-f-]{36}$/i.test(input.person_id) ||
    !/^[0-9a-f-]{36}$/i.test(input.relationship_context_id) ||
    input.objective.trim().length === 0 ||
    input.objective.length > 1_000
  ) {
    throw new Error("The Chat task scope is incomplete.");
  }
  const objective = input.objective.trim();
  const { client } = await authenticatedClient("web-relationship-chat");
  await client.compileKnowledge(
    input.person_id,
    input.relationship_context_id,
    {
      idempotency_key: `web-wiki:${input.request_id}`,
      objective,
    },
  );
  return client.createChatTask({
    idempotency_key: `web-chat:${input.request_id}`,
    objective,
    person_id: input.person_id,
    relationship_context_id: input.relationship_context_id,
  });
}

export async function decideBackendAssertion(
  assertionId: string,
  request: AssertionDecisionRequest,
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-fact-review");
  await client.decideAssertion(assertionId, request);
  return readWorkspace(client, captureId);
}

export async function decideRelationshipClaim(
  assertionId: string,
  request: AssertionDecisionRequest,
): Promise<AssertionDecisionResponse> {
  const { client } = await authenticatedClient(
    "web-relationship-claim-review",
  );
  return client.decideAssertion(assertionId, request);
}

export async function correctRelationshipResourceIdentity(
  captureId: string,
  request: CaptureIdentityCorrectionRequest,
): Promise<
  CaptureIdentityCorrectionResponse & {
    prior_compilation: KnowledgeSnapshot | null;
    prior_compilation_error: string | null;
    target_compilation: KnowledgeSnapshot | null;
    target_compilation_error: string | null;
  }
> {
  const { client } = await authenticatedClient(
    "web-relationship-identity-correction",
  );
  const correction = await client.correctCaptureIdentity(
    captureId,
    request,
  );
  let targetCompilation: KnowledgeSnapshot | null = null;
  let targetCompilationError: string | null = null;
  try {
    targetCompilation = await client.compileKnowledge(
      correction.person_id,
      correction.relationship_context_id,
      {
        idempotency_key: `identity-correction:${correction.decision_id}:target`,
        objective:
          "Recompile the corrected relationship after the recruiter moved governed source lineage",
      },
    );
  } catch (caught) {
    targetCompilationError =
      caught instanceof Error
        ? caught.message
        : "The corrected relationship Wiki could not be recompiled.";
  }

  const scopeChanged =
    correction.prior_person_id !== correction.person_id ||
    correction.prior_relationship_context_id !==
      correction.relationship_context_id;
  let priorCompilation: KnowledgeSnapshot | null = null;
  let priorCompilationError: string | null = null;
  if (scopeChanged) {
    try {
      priorCompilation = await client.compileKnowledge(
        correction.prior_person_id,
        correction.prior_relationship_context_id,
        {
          idempotency_key: `identity-correction:${correction.decision_id}:prior`,
          objective:
            "Recompile the prior relationship after governed source lineage moved away",
        },
      );
    } catch (caught) {
      priorCompilationError =
        caught instanceof Error
          ? caught.message
          : "The prior relationship Wiki could not be recompiled.";
    }
  }

  return {
    ...correction,
    prior_compilation: priorCompilation,
    prior_compilation_error: priorCompilationError,
    target_compilation: targetCompilation,
    target_compilation_error: targetCompilationError,
  };
}

export async function decideRelationshipSourceAuthorization(
  captureId: string,
  request: SourceAuthorizationDecisionRequest,
): Promise<SourceAuthorizationDecisionResponse> {
  const { client } = await authenticatedClient(
    "web-source-authorization",
  );
  return client.decideCaptureSourceAuthorization(captureId, request);
}

export async function approveBackendAction(
  actionId: string,
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-action-approval");
  const workspace = await readWorkspace(client, captureId);
  const action = workspace.analysis.action;
  if (!action || action.id !== actionId) {
    throw new Error("The current synthetic action proposal was not found.");
  }
  await client.approveAction(action.id, {
    idempotency_key: `web-approve:${action.id}:v${action.version}`,
    expected_action_version: action.version,
    exact_preview: action.exact_preview,
  });
  return readWorkspace(client, captureId);
}

export async function executeBackendAction(
  actionId: string,
  captureId?: string,
): Promise<{
  effect: EffectResultResponse;
  workspace: WorkspaceReviewResponse;
}> {
  const { client } = await authenticatedClient("web-action-execution");
  const workspace = await readWorkspace(client, captureId);
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
    workspace: await readWorkspace(client, captureId),
  };
}

export async function reconcileBackendEffect(
  attemptId: string,
  captureId?: string,
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
    workspace: await readWorkspace(client, captureId),
  };
}

export async function previewBackendEffectReversal(
  attemptId: string,
): Promise<EffectReversalPreview> {
  const { client } = await authenticatedClient("web-effect-reversal-preview");
  return client.previewEffectReversal(attemptId);
}

export async function approveBackendEffectReversal(
  attemptId: string,
  request: {
    expected_destination_version: number;
    expected_preview_digest: string;
    reason: string;
    request_id: string;
  },
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-effect-reversal-approval");
  await client.approveEffectReversal(attemptId, {
    idempotency_key: `web-reversal-approve:${request.request_id}`,
    expected_destination_version: request.expected_destination_version,
    expected_preview_digest: request.expected_preview_digest,
    reason: request.reason,
  });
  return readWorkspace(client, captureId);
}

export async function executeBackendEffectReversal(
  attemptId: string,
  approvalId: string,
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-effect-reversal-execution");
  await client.executeEffectReversal(attemptId, {
    idempotency_key: `web-reversal-execute:${attemptId}:${approvalId}`,
    approval_id: approvalId,
  });
  return readWorkspace(client, captureId);
}

export async function revokeBackendEffectReversalApproval(
  approvalId: string,
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-effect-reversal-revocation");
  await client.revokeEffectReversalApproval(approvalId, {
    idempotency_key: `web-reversal-revoke:${approvalId}`,
    reason: "Recruiter cancelled the exact local effect reversal approval.",
  });
  return readWorkspace(client, captureId);
}

export async function revokeBackendApproval(
  approvalId: string,
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-approval-revocation");
  await client.revokeApproval(approvalId, {
    idempotency_key: `web-revoke-approval:${approvalId}`,
    reason: "Recruiter cancelled the synthetic local effect approval.",
  });
  return readWorkspace(client, captureId);
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
  captureId?: string,
): Promise<WorkspaceReviewResponse> {
  const { client } = await authenticatedClient("web-action-revision");
  const workspace = await readWorkspace(client, captureId);
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
  return readWorkspace(client, captureId);
}

export type CommitScreenshotCaptureInput = {
  request_id: string;
  person_id?: string | null;
  relationship_context_id?: string | null;
  contact_name: string;
  assignment_label: string;
  draft: ScreenshotCaptureDraft;
  original_draft?: ScreenshotCaptureDraft;
  analysis_meta: ScreenshotAnalysisMeta;
  analysis_receipt: string;
};

export async function commitScreenshotCapture(
  input: CommitScreenshotCaptureInput,
): Promise<WorkspaceReviewResponse> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.request_id,
    ) ||
    input.contact_name.trim().length === 0 ||
    input.contact_name.length > 160 ||
    input.assignment_label.trim().length === 0 ||
    input.assignment_label.length > 200
  ) {
    throw new Error("The reviewed screenshot capture is incomplete.");
  }
  const submittedDraft = validateScreenshotCaptureDraft(input.draft);
  const receiptDraft = input.original_draft
    ? validateScreenshotCaptureDraft(input.original_draft)
    : submittedDraft;
  const analysisMeta = validateScreenshotAnalysisMeta(input.analysis_meta);
  if (
    typeof input.analysis_receipt !== "string" ||
    input.analysis_receipt.length > 2_000 ||
    !verifyScreenshotAnalysisReceipt(input.analysis_receipt, {
      draft: receiptDraft,
      meta: analysisMeta,
    })
  ) {
    throw new Error(
      "The screenshot analysis receipt is missing, expired, or does not match this draft.",
    );
  }
  const humanEdited = Boolean(input.original_draft);
  const draft = humanEdited
    ? validateReviewedScreenshotEdit(receiptDraft, submittedDraft)
    : submittedDraft;
  const contactName = input.contact_name.trim();
  const assignmentLabel = input.assignment_label.trim();
  const personId = input.person_id?.trim() || null;
  const relationshipContextId =
    input.relationship_context_id?.trim() || null;
  if (
    personId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      personId,
    )
  ) {
    throw new Error("The selected person identity is invalid.");
  }
  if (
    relationshipContextId !== null &&
    (!personId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        relationshipContextId,
      ))
  ) {
    throw new Error("The selected relationship context is invalid.");
  }
  const newPersonRef = `web-person:${stableRef(`new\n${input.request_id}`)}`;
  const personBindingRef = personId ?? newPersonRef;
  const assignmentKey = stableRef(
    `${personBindingRef}\n${assignmentLabel.normalize("NFKC").toLowerCase()}`,
  );
  const { client } = await authenticatedClient("web-screenshot-capture");
  const capture = await client.createCapture({
    idempotency_key: `web-screenshot:${input.request_id}`,
    source: {
      kind: "screenshot_metadata",
      channel: "web_upload",
      captured_at: new Date().toISOString(),
      source_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      purpose:
        `${humanEdited ? "Recruiter-edited" : "Recruiter-reviewed"} ${draft.platform} conversation screenshot transcription for relationship context`,
      source_locator: [
        `sha256:${analysisMeta.source_sha256}`,
        `provider:${analysisMeta.provider}`,
        `request:${analysisMeta.request_id ?? "not-returned"}`,
        ...(analysisMeta.pre_provider_minimization
          ? [
              `browser-crop:${analysisMeta.pre_provider_minimization.crop_top_percent}-${analysisMeta.pre_provider_minimization.crop_bottom_percent}`,
              `browser-redactions:${analysisMeta.pre_provider_minimization.redaction_count}`,
            ]
          : []),
      ].join(";"),
      retention: {
        requested_mode: "evidence_crop",
        source_scope: "reviewed_extracted_text",
      },
    },
    identity: personId
      ? {
          status: "bound_existing",
          subject_id: personId,
          ...(relationshipContextId
            ? { assignment_id: relationshipContextId }
            : {}),
          assignment_ref: `web-assignment:${assignmentKey}`,
          assignment_label: assignmentLabel,
          binding_basis:
            "The signed-in recruiter explicitly selected this existing person before committing the reviewed capture.",
        }
      : {
          status: "bound",
          external_ref: newPersonRef,
          display_label: contactName,
          assignment_ref: `web-assignment:${assignmentKey}`,
          assignment_label: assignmentLabel,
          binding_basis:
            "The signed-in recruiter explicitly confirmed creation of a new person before committing the reviewed capture.",
        },
    messages: draft.messages,
  });
  const messageById = new Map(
    draft.messages.map((message) => [message.source_message_id, message]),
  );
  await client.submitAnalysis(capture.id, {
    idempotency_key: `web-screenshot-analysis:${input.request_id}`,
    producer: {
      kind: humanEdited ? "human_draft" : "model",
      name: humanEdited
        ? `Recruiter-reviewed transcription · ${analysisMeta.provider}`.slice(
            0,
            120,
          )
        : `${analysisMeta.provider} · ${analysisMeta.model}`.slice(0, 120),
      version: [
        draft.schema_version,
        analysisMeta.prompt_version,
        humanEdited ? "human-transcription-edit" : "model-draft",
        analysisMeta.request_id ?? "request-id-not-returned",
      ]
        .join(":")
        .slice(0, 120),
    },
    disposition: draft.disposition,
    assertions: draft.assertions.map((assertion) => ({
      field: assertion.field,
      status: assertion.status,
      value: assertion.value,
      evidence_message_id: assertion.evidence_message_id,
      evidence_quote: assertion.evidence_quote,
      subject_kind:
        messageById.get(assertion.evidence_message_id)?.speaker ===
        "candidate"
          ? "candidate"
          : "unknown",
      temporal_relation: "new",
    })),
    action: draft.action
      ? {
          type: "prepare_question",
          owner: "recruiter",
          target: draft.action.target,
          reason: draft.action.reason,
          due: draft.action.due,
          evidence_message_ids: draft.action.evidence_message_ids,
          effect_preview: {
            simulated: true,
            capability: SIMULATED_CAPABILITY,
            adapter: "local_deterministic",
            target: {
              destination_key: `assignment:${assignmentKey}:attention`,
              label: `${contactName} · recruiter attention queue`,
            },
            change: {
              kind: "create_attention",
              title: `Prepare question: ${draft.action.target}`,
            },
            expected_destination_version: 0,
            simulation_behavior: "success",
          },
        }
      : null,
  });
  return client.getWorkspaceReviewByCapture(capture.id);
}

export async function deleteBackendCapture(
  captureId: string,
): Promise<{
  deletion: DeleteCaptureResponse;
  lineage: DeletionLineageResponse;
  compilation: KnowledgeSnapshot | null;
  compilation_error: string | null;
}> {
  const { client } = await authenticatedClient("web-source-deletion");
  const capture = await client.getCapture(captureId);
  const deletion = await client.deleteCapture(captureId, {
    idempotency_key: `web-delete:${captureId}`,
    reason: "Recruiter requested deletion of the synthetic local source.",
  });
  const lineage = await client.getDeletionLineage(deletion.deletion_id);
  if (!capture.subject_id || !capture.assignment_id) {
    return {
      deletion,
      lineage,
      compilation: null,
      compilation_error: null,
    };
  }

  try {
    const compilation = await client.compileKnowledge(
      capture.subject_id,
      capture.assignment_id,
      {
        idempotency_key: `source-deletion:${deletion.deletion_id}:relationship`,
        objective:
          "Recompile the relationship from the governed sources that remain after recruiter-requested deletion",
      },
    );
    return {
      deletion,
      lineage,
      compilation,
      compilation_error: null,
    };
  } catch (caught) {
    return {
      deletion,
      lineage,
      compilation: null,
      compilation_error:
        caught instanceof TalentSignalHttpError &&
        caught.code === "RELATIONSHIP_CONTEXT_NOT_FOUND"
          ? null
          : caught instanceof Error
            ? caught.message
            : "The source was deleted, but the remaining relationship Wiki could not be recompiled.",
    };
  }
}
