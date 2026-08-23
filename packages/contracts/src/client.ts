import type {
  AnalysisProposalResponse,
  ApproveEffectReversalRequest,
  ApproveActionRequest,
  ApprovalResponse,
  AssertionDecisionRequest,
  AssertionDecisionResponse,
  CaptureResponse,
  CreateCaptureRequest,
  DeleteCaptureRequest,
  DeleteCaptureResponse,
  DeletionLineageResponse,
  EffectResultResponse,
  EffectReversalApprovalResponse,
  EffectReversalPreview,
  EffectReversalResultResponse,
  ExecuteEffectReversalRequest,
  ExecuteActionRequest,
  ReconcileEffectRequest,
  ReviseActionRequest,
  SessionResponse,
  SimulatedLoginRequest,
  SourceRetentionReceipt,
  SubmitAnalysisProposalRequest,
  SyncResponse,
  TemporalStateResponse,
  WorkspaceReviewResponse,
} from "./schemas.js";
import type {
  PersonDirectoryResponse,
  CaptureIdentityCorrectionRequest,
  CaptureIdentityCorrectionResponse,
  EvidenceFragmentReviewRequest,
  EvidenceFragmentReviewResponse,
  IdentityResolutionCase,
  IdentityResolutionDecisionRequest,
  IdentityResolutionDecisionResponse,
  PersonMergePreview,
  PersonMergeRequest,
  PersonMergeResponse,
  PersonMergeReversalRequest,
  PersonMergeReversalPreview,
  PublicResearchRequest,
  PublicResearchResponse,
  RelationshipAgentHistory,
  RelationshipResourceDetail,
  RelationshipResourceListResponse,
  RelationshipScope,
  ResourceCaptureRequest,
  ResourceCaptureResponse,
  SourceAuthorizationDecisionRequest,
  SourceAuthorizationDecisionResponse,
} from "./resourceSchemas.js";
import type {
  CompileKnowledgeRequest,
  ChatTaskRequest,
  ChatTaskResponse,
  KnowledgeSnapshot,
} from "./resourceSchemas.js";

export class TalentSignalHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "TalentSignalHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class TalentSignalClient {
  readonly baseUrl: string;
  private accessToken: string | undefined;

  constructor(baseUrl: string, accessToken?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.accessToken = accessToken;
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  async login(request: SimulatedLoginRequest): Promise<SessionResponse> {
    const response = await this.request<SessionResponse>(
      "/v1/auth/simulated-login",
      { method: "POST", body: request, authenticated: false },
    );
    this.setAccessToken(response.access_token);
    return response;
  }

  createCapture(request: CreateCaptureRequest): Promise<CaptureResponse> {
    return this.request("/v1/captures", { method: "POST", body: request });
  }

  createResourceCapture(
    request: ResourceCaptureRequest,
  ): Promise<ResourceCaptureResponse> {
    return this.request("/v1/resource-captures", {
      method: "POST",
      body: request,
    });
  }

  listRelationshipResources(
    personId: string,
    relationshipContextId: string,
  ): Promise<RelationshipResourceListResponse> {
    return this.request(
      `/v1/people/${personId}/contexts/${relationshipContextId}/resources`,
      { method: "GET" },
    );
  }

  getRelationshipResource(
    resourceId: string,
  ): Promise<RelationshipResourceDetail> {
    return this.request(`/v1/resources/${resourceId}`, {
      method: "GET",
    });
  }

  reviewEvidenceFragment(
    fragmentId: string,
    request: EvidenceFragmentReviewRequest,
  ): Promise<EvidenceFragmentReviewResponse> {
    return this.request(`/v1/evidence-fragments/${fragmentId}/reviews`, {
      method: "POST",
      body: request,
    });
  }

  getIdentityResolutionCase(
    caseId: string,
  ): Promise<IdentityResolutionCase> {
    return this.request(`/v1/identity-resolution-cases/${caseId}`, {
      method: "GET",
    });
  }

  decideIdentityResolutionCase(
    caseId: string,
    request: IdentityResolutionDecisionRequest,
  ): Promise<IdentityResolutionDecisionResponse> {
    return this.request(
      `/v1/identity-resolution-cases/${caseId}/decisions`,
      {
        method: "POST",
        body: request,
      },
    );
  }

  correctCaptureIdentity(
    captureId: string,
    request: CaptureIdentityCorrectionRequest,
  ): Promise<CaptureIdentityCorrectionResponse> {
    return this.request(
      `/v1/captures/${captureId}/identity-corrections`,
      {
        method: "POST",
        body: request,
      },
    );
  }

  previewPersonMerge(
    sourcePersonId: string,
    targetPersonId: string,
  ): Promise<PersonMergePreview> {
    return this.request(
      `/v1/person-merges/preview?source_person_id=${encodeURIComponent(
        sourcePersonId,
      )}&target_person_id=${encodeURIComponent(targetPersonId)}`,
      { method: "GET" },
    );
  }

  mergePeople(
    request: PersonMergeRequest,
  ): Promise<PersonMergeResponse> {
    return this.request("/v1/person-merges", {
      method: "POST",
      body: request,
    });
  }

  reversePersonMerge(
    operationId: string,
    request: PersonMergeReversalRequest,
  ): Promise<PersonMergeResponse> {
    return this.request(`/v1/person-merges/${operationId}/reversal`, {
      method: "POST",
      body: request,
    });
  }

  getPersonMergeReversalPreview(
    operationId: string,
  ): Promise<PersonMergeReversalPreview> {
    return this.request(`/v1/person-merges/${operationId}/reversal`, {
      method: "GET",
    });
  }

  decideCaptureSourceAuthorization(
    captureId: string,
    request: SourceAuthorizationDecisionRequest,
  ): Promise<SourceAuthorizationDecisionResponse> {
    return this.request(
      `/v1/captures/${captureId}/source-authorization-decisions`,
      {
        method: "POST",
        body: request,
      },
    );
  }

  runPublicResearch(
    request: PublicResearchRequest,
  ): Promise<PublicResearchResponse> {
    return this.request("/v1/research-tasks", {
      method: "POST",
      body: request,
    });
  }

  getLatestPublicResearchTask(
    seedResourceId: string,
  ): Promise<PublicResearchResponse | null> {
    return this.request(
      `/v1/research-tasks/latest?seed_resource_id=${encodeURIComponent(
        seedResourceId,
      )}`,
      { method: "GET" },
    );
  }

  getCapture(captureId: string): Promise<CaptureResponse> {
    return this.request(`/v1/captures/${captureId}`, { method: "GET" });
  }

  listPeople(query = ""): Promise<PersonDirectoryResponse> {
    const search = query.trim()
      ? `?query=${encodeURIComponent(query.trim())}`
      : "";
    return this.request(`/v1/people${search}`, { method: "GET" });
  }

  searchPeople(query: string): Promise<PersonDirectoryResponse> {
    return this.request("/v1/people/search", {
      method: "POST",
      body: { query },
    });
  }

  getRelationshipScope(
    personId: string,
    relationshipContextId: string,
  ): Promise<RelationshipScope> {
    return this.request(
      `/v1/people/${personId}/contexts/${relationshipContextId}`,
      { method: "GET" },
    );
  }

  getRelationshipAgentHistory(
    personId: string,
    relationshipContextId: string,
  ): Promise<RelationshipAgentHistory> {
    return this.request(
      `/v1/people/${personId}/contexts/${relationshipContextId}/agent-history`,
      { method: "GET" },
    );
  }

  compileKnowledge(
    personId: string,
    relationshipContextId: string,
    request: CompileKnowledgeRequest,
  ): Promise<KnowledgeSnapshot> {
    return this.request(
      `/v1/people/${personId}/contexts/${relationshipContextId}/wiki-compilations`,
      { method: "POST", body: request },
    );
  }

  getKnowledge(
    personId: string,
    relationshipContextId: string,
  ): Promise<KnowledgeSnapshot> {
    return this.request(
      `/v1/people/${personId}/contexts/${relationshipContextId}/wiki`,
      { method: "GET" },
    );
  }

  createChatTask(request: ChatTaskRequest): Promise<ChatTaskResponse> {
    return this.request("/v1/chat/tasks", {
      method: "POST",
      body: request,
    });
  }

  getSourceRetentionReceipt(
    captureId: string,
  ): Promise<SourceRetentionReceipt> {
    return this.request(`/v1/captures/${captureId}/retention`, {
      method: "GET",
    });
  }

  getSourceRetentionReceiptByLocator(
    sourceLocator: string,
  ): Promise<SourceRetentionReceipt> {
    return this.request(
      `/v1/source-retention-receipts?source_locator=${encodeURIComponent(sourceLocator)}`,
      { method: "GET" },
    );
  }

  submitAnalysis(
    captureId: string,
    request: SubmitAnalysisProposalRequest,
  ): Promise<AnalysisProposalResponse> {
    return this.request(`/v1/captures/${captureId}/analysis-proposals`, {
      method: "POST",
      body: request,
    });
  }

  decideAssertion(
    assertionId: string,
    request: AssertionDecisionRequest,
  ): Promise<AssertionDecisionResponse> {
    return this.request(`/v1/assertions/${assertionId}/decisions`, {
      method: "POST",
      body: request,
    });
  }

  reviseAction(
    actionId: string,
    request: ReviseActionRequest,
  ): Promise<{ id: string; version: number; exact_preview_digest: string }> {
    return this.request(`/v1/actions/${actionId}/revisions`, {
      method: "POST",
      body: request,
    });
  }

  approveAction(
    actionId: string,
    request: ApproveActionRequest,
  ): Promise<ApprovalResponse> {
    return this.request(`/v1/actions/${actionId}/approvals`, {
      method: "POST",
      body: request,
    });
  }

  executeAction(
    actionId: string,
    request: ExecuteActionRequest,
  ): Promise<EffectResultResponse> {
    return this.request(`/v1/actions/${actionId}/executions`, {
      method: "POST",
      body: request,
    });
  }

  reconcileEffect(
    attemptId: string,
    request: ReconcileEffectRequest,
  ): Promise<EffectResultResponse> {
    return this.request(`/v1/effect-attempts/${attemptId}/reconcile`, {
      method: "POST",
      body: request,
    });
  }

  previewEffectReversal(
    attemptId: string,
  ): Promise<EffectReversalPreview> {
    return this.request(`/v1/effect-attempts/${attemptId}/reversal`, {
      method: "GET",
    });
  }

  approveEffectReversal(
    attemptId: string,
    request: ApproveEffectReversalRequest,
  ): Promise<EffectReversalApprovalResponse> {
    return this.request(
      `/v1/effect-attempts/${attemptId}/reversal-approvals`,
      { method: "POST", body: request },
    );
  }

  executeEffectReversal(
    attemptId: string,
    request: ExecuteEffectReversalRequest,
  ): Promise<EffectReversalResultResponse> {
    return this.request(
      `/v1/effect-attempts/${attemptId}/reversal-executions`,
      { method: "POST", body: request },
    );
  }

  revokeEffectReversalApproval(
    approvalId: string,
    request: { idempotency_key: string; reason: string },
  ): Promise<{ id: string; status: "revoked" }> {
    return this.request(
      `/v1/effect-reversal-approvals/${approvalId}/revocation`,
      { method: "POST", body: request },
    );
  }

  deleteCapture(
    captureId: string,
    request: DeleteCaptureRequest,
  ): Promise<DeleteCaptureResponse> {
    return this.request(`/v1/captures/${captureId}/deletion`, {
      method: "POST",
      body: request,
    });
  }

  getTemporalState(assignmentId: string): Promise<TemporalStateResponse> {
    return this.request(
      `/v1/state?assignment_id=${encodeURIComponent(assignmentId)}`,
      { method: "GET" },
    );
  }

  getWorkspaceReview(fixtureCaseId: string): Promise<WorkspaceReviewResponse> {
    return this.request(
      `/v1/workspace-review?fixture_case_id=${encodeURIComponent(fixtureCaseId)}`,
      { method: "GET" },
    );
  }

  getWorkspaceReviewByCapture(
    captureId: string,
  ): Promise<WorkspaceReviewResponse> {
    return this.request(
      `/v1/workspace-review?capture_id=${encodeURIComponent(captureId)}`,
      { method: "GET" },
    );
  }

  getDeletionLineage(deletionId: string): Promise<DeletionLineageResponse> {
    return this.request(`/v1/deletions/${deletionId}/lineage`, {
      method: "GET",
    });
  }

  revokeApproval(
    approvalId: string,
    request: { idempotency_key: string; reason: string },
  ): Promise<{ id: string; status: "revoked" }> {
    return this.request(`/v1/approvals/${approvalId}/revocation`, {
      method: "POST",
      body: request,
    });
  }

  revokeCapability(request: {
    idempotency_key: string;
    capability: "local.simulated_attention.create";
    reason: string;
  }): Promise<{
    capability: string;
    status: "revoked";
  }> {
    return this.request("/v1/authorizations/revocation", {
      method: "POST",
      body: request,
    });
  }

  sync(after = 0): Promise<SyncResponse> {
    return this.request(`/v1/sync?after=${after}`, { method: "GET" });
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
      authenticated?: boolean;
    },
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    if (authenticated && !this.accessToken) {
      throw new Error("An access token is required for this request.");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        accept: "application/json",
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(authenticated
          ? { authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = (await response.json()) as T | ErrorEnvelope;
    if (!response.ok) {
      const envelope = payload as ErrorEnvelope;
      throw new TalentSignalHttpError(
        response.status,
        envelope.error?.code ?? "HTTP_ERROR",
        envelope.error?.message ?? `Request failed with ${response.status}.`,
        envelope.error?.details,
      );
    }
    return payload as T;
  }
}
