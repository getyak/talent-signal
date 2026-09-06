import type {
  AnalysisProposalResponse,
  AppleLoginChallengeRequest,
  AppleLoginChallengeResponse,
  AppleLoginRequest,
  ApproveEffectReversalRequest,
  ApproveActionRequest,
  ApprovalResponse,
  AssertionDecisionRequest,
  AssertionDecisionResponse,
  CaptureResponse,
  CurrentSessionResponse,
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
  LogoutResponse,
  PasswordLoginRequest,
  PasswordRegistrationRequest,
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
  ChatMediaAsset,
  ChatMediaDeleteResponse,
  ChatTaskRequest,
  ChatTaskReadback,
  ChatTaskResponse,
  CreateChatMediaRequest,
  KnowledgeSnapshot,
} from "./resourceSchemas.js";
import type {
  PursuitProposalListResponse,
  PursuitProposalResponse,
  PursuitProposalReviewResponse,
  ReviewPursuitProposalRequest,
  StagePursuitProposalRequest,
} from "./proposalSchemas.js";
import type {
  CompletePursuitActionRequest,
  CreatePursuitRequest,
  PursuitDetailResponse,
  PursuitListResponse,
  PursuitMutationResponse,
  PursuitOperationResponse,
  RevisePursuitRequest,
} from "./pursuitSchemas.js";
import type {
  AgentTaskEventsResponse,
  AgentDecisionResolutionResponse,
  AgentTaskListResponse,
  AgentTaskResponse,
  AgentRunResponse,
  CancelAgentTaskRequest,
  CreatePursuitAgentTaskRequest,
  CreatePursuitAgentRunRequest,
  ResolveAgentDecisionBundleRequest,
} from "./agentSchemas.js";
import type {
  AppendTelemetryBatchRequest,
  CompleteTelemetryTraceRequest,
  CreateTelemetryTraceRequest,
  TelemetryMutationResponse,
  TelemetryTraceDetailResponse,
  TelemetryTraceListResponse,
} from "./telemetrySchemas.js";
import type {
  CompareLabScenarioRequest,
  CreateRealityReceiptRequest,
  LabComparisonResponse,
  LabEvalCaseResponse,
  LabManifestResponse,
  LabRunResponse,
  LabSessionResponse,
  PromoteRealityReceiptRequest,
  RealityReceiptResponse,
  RunLabScenarioRequest,
  StartLabSessionRequest,
} from "./labSchemas.js";
import type {
  LabJobCatalog,
  LabJobRequest,
  LabJobResponse,
  LabJobReview,
} from "./labJobSchemas.js";
import type {
  LabRegressionList,
  LabRegressionRequest,
  LabRegressionResponse,
} from "./labRegressionSchemas.js";
import type {
  LabFeatureConfiguration,
  LabFeatureOverrideRequest,
  LabFeatureOverride,
} from "./labFeatureSchemas.js";

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

export type VoiceTranscriptionRequest = {
  audio_base64: string;
  client_request_id: string;
  mime_type: "audio/wav";
};

export type VoiceTranscriptionDraft = {
  audio_duration_ms?: number;
  client_request_id: string;
  model: string;
  provider: "doubao";
  provider_request_id: string;
  status: "draft";
  temporary_audio_stored_by_talent_signal: false;
  transcript: string;
};

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

  async signInWithPassword(
    request: PasswordLoginRequest,
  ): Promise<SessionResponse> {
    const response = await this.request<SessionResponse>(
      "/v1/auth/password/login",
      { method: "POST", body: request, authenticated: false },
    );
    this.setAccessToken(response.access_token);
    return response;
  }

  async registerWithPassword(
    request: PasswordRegistrationRequest,
  ): Promise<SessionResponse> {
    const response = await this.request<SessionResponse>(
      "/v1/auth/password/register",
      { method: "POST", body: request, authenticated: false },
    );
    this.setAccessToken(response.access_token);
    return response;
  }

  createAppleLoginChallenge(
    request: AppleLoginChallengeRequest,
  ): Promise<AppleLoginChallengeResponse> {
    return this.request("/v1/auth/apple/challenges", {
      method: "POST",
      body: request,
      authenticated: false,
    });
  }

  async signInWithApple(request: AppleLoginRequest): Promise<SessionResponse> {
    const response = await this.request<SessionResponse>("/v1/auth/apple", {
      method: "POST",
      body: request,
      authenticated: false,
    });
    this.setAccessToken(response.access_token);
    return response;
  }

  currentSession(): Promise<CurrentSessionResponse> {
    return this.request("/v1/auth/session", { method: "GET" });
  }

  async logout(): Promise<LogoutResponse> {
    const response = await this.request<LogoutResponse>("/v1/auth/logout", {
      method: "POST",
    });
    this.accessToken = undefined;
    return response;
  }

  createPursuit(
    request: CreatePursuitRequest,
  ): Promise<PursuitMutationResponse> {
    return this.request("/v1/pursuits", { method: "POST", body: request });
  }

  listPursuits(): Promise<PursuitListResponse> {
    return this.request("/v1/pursuits", { method: "GET" });
  }

  getPursuit(pursuitId: string): Promise<PursuitDetailResponse> {
    return this.request(`/v1/pursuits/${pursuitId}`, { method: "GET" });
  }

  revisePursuit(
    pursuitId: string,
    request: RevisePursuitRequest,
  ): Promise<PursuitMutationResponse> {
    return this.request(`/v1/pursuits/${pursuitId}/revisions`, {
      method: "POST",
      body: request,
    });
  }

  completePursuitAction(
    pursuitId: string,
    actionId: string,
    request: CompletePursuitActionRequest,
  ): Promise<PursuitMutationResponse> {
    return this.request(
      `/v1/pursuits/${pursuitId}/actions/${actionId}/completions`,
      { method: "POST", body: request },
    );
  }

  getOperation(operationId: string): Promise<PursuitOperationResponse> {
    return this.request(`/v1/operations/${operationId}`, { method: "GET" });
  }

  createPursuitAgentRun(
    pursuitId: string,
    request: CreatePursuitAgentRunRequest,
  ): Promise<AgentRunResponse> {
    return this.request(`/v1/pursuits/${pursuitId}/agent-runs`, {
      method: "POST",
      body: request,
    });
  }

  getAgentRun(runId: string): Promise<AgentRunResponse> {
    return this.request(`/v1/agent-runs/${runId}`, { method: "GET" });
  }

  createPursuitAgentTask(
    pursuitId: string,
    request: CreatePursuitAgentTaskRequest,
  ): Promise<AgentDecisionResolutionResponse> {
    return this.request(`/v1/pursuits/${pursuitId}/agent-tasks`, {
      method: "POST",
      body: request,
    });
  }

  listPursuitAgentTasks(
    pursuitId: string,
    state: "active" | "all" = "active",
  ): Promise<AgentTaskListResponse> {
    return this.request(
      `/v1/pursuits/${pursuitId}/agent-tasks?state=${state}`,
      { method: "GET" },
    );
  }

  getAgentTask(taskId: string): Promise<AgentTaskResponse> {
    return this.request(`/v1/agent-tasks/${taskId}`, { method: "GET" });
  }

  getAgentTaskEvents(
    taskId: string,
    afterSequence = 0,
  ): Promise<AgentTaskEventsResponse> {
    return this.request(
      `/v1/agent-tasks/${taskId}/events?after=${afterSequence}`,
      { method: "GET" },
    );
  }

  cancelAgentTask(
    taskId: string,
    request: CancelAgentTaskRequest,
  ): Promise<AgentTaskResponse> {
    return this.request(`/v1/agent-tasks/${taskId}/cancel`, {
      method: "POST",
      body: request,
    });
  }

  resolveAgentDecisionBundle(
    bundleId: string,
    request: ResolveAgentDecisionBundleRequest,
  ): Promise<AgentDecisionResolutionResponse> {
    return this.request(`/v1/decision-bundles/${bundleId}/resolve`, {
      method: "POST",
      body: request,
    });
  }

  createTelemetryTrace(
    request: CreateTelemetryTraceRequest,
  ): Promise<TelemetryMutationResponse> {
    return this.request("/v1/telemetry/traces", {
      method: "POST",
      body: request,
    });
  }

  appendTelemetryBatch(
    traceId: string,
    request: AppendTelemetryBatchRequest,
  ): Promise<TelemetryMutationResponse> {
    return this.request(`/v1/telemetry/traces/${traceId}/batch`, {
      method: "POST",
      body: request,
    });
  }

  completeTelemetryTrace(
    traceId: string,
    request: CompleteTelemetryTraceRequest,
  ): Promise<TelemetryMutationResponse> {
    return this.request(`/v1/telemetry/traces/${traceId}/completion`, {
      method: "POST",
      body: request,
    });
  }

  listTelemetryTraces(limit = 100): Promise<TelemetryTraceListResponse> {
    return this.request(`/v1/eval/traces?limit=${limit}`, { method: "GET" });
  }

  getTelemetryTrace(traceId: string): Promise<TelemetryTraceDetailResponse> {
    return this.request(`/v1/eval/traces/${traceId}`, { method: "GET" });
  }

  getLabManifest(): Promise<LabManifestResponse> {
    return this.request("/v1/lab", { method: "GET" });
  }

  startLabSession(
    request: StartLabSessionRequest,
  ): Promise<LabSessionResponse> {
    return this.request("/v1/lab/sessions", { method: "POST", body: request });
  }

  runLabScenario(
    sessionId: string,
    request: RunLabScenarioRequest,
  ): Promise<LabRunResponse> {
    return this.request(`/v1/lab/sessions/${sessionId}/runs`, {
      method: "POST",
      body: request,
    });
  }

  compareLabScenario(
    sessionId: string,
    request: CompareLabScenarioRequest,
  ): Promise<LabComparisonResponse> {
    return this.request(`/v1/lab/sessions/${sessionId}/comparisons`, {
      method: "POST",
      body: request,
    });
  }

  createRealityReceipt(
    sessionId: string,
    request: CreateRealityReceiptRequest,
  ): Promise<RealityReceiptResponse> {
    return this.request(`/v1/lab/sessions/${sessionId}/receipts`, {
      method: "POST",
      body: request,
    });
  }

  promoteRealityReceipt(
    receiptId: string,
    request: PromoteRealityReceiptRequest,
  ): Promise<LabEvalCaseResponse> {
    return this.request(`/v1/lab/receipts/${receiptId}/promotions`, {
      method: "POST",
      body: request,
    });
  }

  getLabJobCatalog(): Promise<LabJobCatalog> {
    return this.request("/v1/lab/experiment-jobs", { method: "GET" });
  }

  startLabJob(request: LabJobRequest): Promise<LabJobResponse> {
    return this.request("/v1/lab/experiment-jobs", {
      method: "POST",
      body: request,
    });
  }

  getLabJob(jobId: string): Promise<LabJobResponse> {
    return this.request(`/v1/lab/experiment-jobs/${jobId}`, { method: "GET" });
  }

  cancelLabJob(jobId: string): Promise<LabJobResponse> {
    return this.request(`/v1/lab/experiment-jobs/${jobId}/cancel`, {
      method: "POST",
      body: {},
    });
  }

  reviewLabJob(jobId: string, review: LabJobReview): Promise<LabJobResponse> {
    return this.request(`/v1/lab/experiment-jobs/${jobId}/review`, {
      method: "POST",
      body: review,
    });
  }

  listLabRegressions(): Promise<LabRegressionList> {
    return this.request("/v1/lab/regressions", { method: "GET" });
  }

  getLabRegression(regressionId: string): Promise<LabRegressionResponse> {
    return this.request(`/v1/lab/regressions/${regressionId}`, {
      method: "GET",
    });
  }

  saveLabRegression(request: LabRegressionRequest): Promise<LabRegressionResponse> {
    return this.request("/v1/lab/regressions", {
      method: "POST",
      body: request,
    });
  }

  getLabFeatureConfiguration(): Promise<LabFeatureConfiguration> {
    return this.request("/v1/lab/feature-configuration", { method: "GET" });
  }

  startLabFeatureOverride(request: LabFeatureOverrideRequest): Promise<{
    contract_version: string;
    override: LabFeatureOverride;
  }> {
    return this.request("/v1/lab/feature-overrides", { method: "POST", body: request });
  }

  getLabFeatureOverride(overrideId: string): Promise<{
    contract_version: string;
    override: LabFeatureOverride;
  }> {
    return this.request(`/v1/lab/feature-overrides/${overrideId}`, { method: "GET" });
  }

  stopLabFeatureOverride(overrideId: string): Promise<{
    contract_version: string;
    override: LabFeatureOverride;
  }> {
    return this.request(`/v1/lab/feature-overrides/${overrideId}/stop`, { method: "POST", body: {} });
  }

  async getTelemetryArtifactContent(
    artifactId: string,
  ): Promise<{ body: ArrayBuffer; contentType: string }> {
    const response = await this.rawRequest(
      `/v1/eval/artifacts/${artifactId}/content`,
      { method: "GET" },
    );
    return {
      body: await response.arrayBuffer(),
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  stagePursuitProposal(
    pursuitId: string,
    request: StagePursuitProposalRequest,
  ): Promise<PursuitProposalResponse> {
    return this.request(`/v1/pursuits/${pursuitId}/proposals`, {
      method: "POST",
      body: request,
    });
  }

  getPursuitProposal(
    proposalId: string,
  ): Promise<PursuitProposalResponse> {
    return this.request(`/v1/pursuit-proposals/${proposalId}`, {
      method: "GET",
    });
  }

  listPursuitProposals(): Promise<PursuitProposalListResponse> {
    return this.request("/v1/pursuit-proposals", { method: "GET" });
  }

  reviewPursuitProposal(
    proposalId: string,
    request: ReviewPursuitProposalRequest,
  ): Promise<PursuitProposalReviewResponse> {
    return this.request(`/v1/pursuit-proposals/${proposalId}/reviews`, {
      method: "POST",
      body: request,
    });
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

  loadResourceCapture(captureId: string): Promise<ResourceCaptureResponse> {
    return this.request(`/v1/resource-captures/${captureId}`, { method: "GET" });
  }

  prepareCaptureReview(captureId: string): Promise<RelationshipResourceDetail> {
    return this.request(`/v1/resource-captures/${captureId}/review-preparations`, { method: "POST" });
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

  transcribeVoice(
    request: VoiceTranscriptionRequest,
  ): Promise<VoiceTranscriptionDraft> {
    return this.request("/v1/voice-transcriptions", {
      method: "POST",
      body: request,
    });
  }

  createChatMedia(request: CreateChatMediaRequest): Promise<ChatMediaAsset> {
    return this.request("/v1/chat/media", { method: "POST", body: request });
  }

  async uploadChatMediaContent(
    mediaId: string,
    body: Uint8Array,
    mediaType: string,
  ): Promise<ChatMediaAsset> {
    const response = await this.rawRequest(`/v1/chat/media/${mediaId}/content`, {
      method: "PUT",
      body: body as BodyInit,
      headers: { "content-type": mediaType },
    });
    return (await response.json()) as ChatMediaAsset;
  }

  deleteChatMedia(mediaId: string): Promise<ChatMediaDeleteResponse> {
    return this.request(`/v1/chat/media/${mediaId}`, { method: "DELETE" });
  }

  getChatMediaContent(mediaId: string): Promise<Response> {
    return this.rawRequest(`/v1/chat/media/${mediaId}/content`, {
      method: "GET",
    });
  }

  getChatTaskReadback(taskId: string): Promise<ChatTaskReadback> {
    return this.request(`/v1/chat/tasks/${taskId}/readback`, {
      method: "GET",
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
      method: "DELETE" | "GET" | "POST";
      body?: unknown;
      authenticated?: boolean;
    },
  ): Promise<T> {
    const response = await this.rawRequest(path, {
      method: options.method,
      headers: {
        accept: "application/json",
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      authenticated: options.authenticated,
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

  private async rawRequest(
    path: string,
    options: {
      method: "DELETE" | "GET" | "POST" | "PUT";
      body?: BodyInit;
      headers?: Record<string, string>;
      authenticated?: boolean;
    },
  ): Promise<Response> {
    const authenticated = options.authenticated ?? true;
    if (authenticated && !this.accessToken) {
      throw new Error("An access token is required for this request.");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        ...(options.headers ?? {}),
        ...(authenticated
          ? { authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      body: options.body,
    });
    if (!response.ok) {
      let envelope: ErrorEnvelope = {};
      try {
        envelope = (await response.clone().json()) as ErrorEnvelope;
      } catch {
        // Binary endpoints may fail before producing a JSON envelope.
      }
      throw new TalentSignalHttpError(
        response.status,
        envelope.error?.code ?? "HTTP_ERROR",
        envelope.error?.message ?? `Request failed with ${response.status}.`,
        envelope.error?.details,
      );
    }
    return response;
  }
}
