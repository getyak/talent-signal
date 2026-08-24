export const AGENT_TOOL_NAMES = [
  "read_pursuit",
  "read_evidence",
  "stage_pursuit_proposal",
  "record_no_action",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type AgentRunStatus =
  | "proposal_staged"
  | "no_action"
  | "quarantined"
  | "budget_exhausted"
  | "cancelled"
  | "failed";

export interface AgentBudget {
  maxTurns: number;
  maxToolCalls: number;
  maxDurationMs: number;
  maxTaskTokens: number;
  maxEstimatedUsd: number;
}

export interface AgentDefinition {
  name: string;
  version: string;
  systemPrompt: string;
  policyVersion: string;
  contractVersion: string;
  toolManifest: readonly AgentToolName[];
}

export interface AgentEvidenceManifestItem {
  fragmentID: string;
  contentHash: string;
  inclusionReason: string;
  authorizationScope: string;
}

export interface AgentRunScope {
  runID: string;
  workspaceID: string;
  userID: string;
  pursuitID: string;
  pursuitRevision: number;
  captureID: string;
  objective: string;
  evidenceManifest: readonly AgentEvidenceManifestItem[];
}

export interface AgentEvidence {
  fragmentID: string;
  text: string;
  observedAt: string;
  sourceDisplayName: string;
  attributionStatus: "confirmed";
  reviewStatus: "reviewed";
  availability: "available";
  contentHash: string;
}

export interface AgentPursuitSnapshot {
  workspaceID: string;
  pursuitID: string;
  revision: number;
  title: string;
  status: string;
  milestone: string;
  roles: readonly unknown[];
  gaps: readonly unknown[];
  actions: readonly unknown[];
}

export interface AgentProposalCandidate {
  summary: string;
  items: Array<{
    itemKey: string;
    epistemicStatus: "fact" | "inference" | "unknown" | "disputed";
    evidenceRefs: string[];
    reason: string;
    effectSummary: string;
    change:
      | { kind: "set_milestone"; proposedValue: string }
      | {
          kind: "set_pursuit_status";
          proposedValue:
            | "draft"
            | "active"
            | "paused"
            | "succeeded"
            | "failed"
            | "cancelled";
        }
      | {
          kind: "set_role_status";
          roleID: string;
          proposedValue: "active" | "quiet" | "removed";
        }
      | {
          kind: "add_gap";
          proposedValue: {
            title: string;
            basisSummary: string;
            closeCondition: string;
          };
        }
      | {
          kind: "add_action";
          proposedValue: {
            title: string;
            ownerUserID: string;
            dueAt: string | null;
          };
        };
  }>;
}

export interface AgentNoActionCandidate {
  reason: string;
  missingEvidenceRefs: string[];
}

export interface AgentFingerprints {
  definition: string;
  systemPrompt: string;
  toolManifest: string;
  sdk: string;
  model: string;
  policy: string;
  contract: string;
  context: string;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  turns: number;
  toolCalls: number;
  durationMs: number;
}

export interface AgentToolResult {
  ok: boolean;
  callID: string;
  name: string;
  data?: unknown;
  candidateFingerprint?: string;
  error?: { code: string; message: string };
}

export interface AgentProviderRequest {
  runID: string;
  objective: string;
  systemPrompt: string;
  scopeSummary: {
    workspaceID: string;
    pursuitID: string;
    pursuitRevision: number;
    evidenceRefs: string[];
  };
  toolManifest: readonly AgentToolName[];
  budget: AgentBudget;
}

export interface AgentProviderResult {
  structuredOutput: unknown;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  turns: number;
  permissionDenials: string[];
  sessionID?: string;
  terminalReason?: string;
}

export interface AgentProvider {
  readonly id: string;
  readonly model: string;
  readonly sdkVersion: string;
  run(
    request: AgentProviderRequest,
    invokeTool: (name: string, input: unknown) => Promise<AgentToolResult>,
    signal: AbortSignal,
  ): Promise<AgentProviderResult>;
}

export interface AgentCapabilityGateway {
  readPursuit(scope: AgentRunScope): Promise<AgentPursuitSnapshot>;
  readEvidence(
    scope: AgentRunScope,
    evidenceRefs: readonly string[],
  ): Promise<readonly AgentEvidence[]>;
  commitProposal(
    scope: AgentRunScope,
    candidate: AgentProposalCandidate,
    candidateFingerprint: string,
  ): Promise<{ proposalID: string; status: "needs_review"; replayed: boolean }>;
  commitNoAction(
    scope: AgentRunScope,
    candidate: AgentNoActionCandidate,
    candidateFingerprint: string,
  ): Promise<{ noActionID: string; replayed: boolean }>;
}

export interface AgentJournalStart {
  scope: AgentRunScope;
  budget: AgentBudget;
  providerID: string;
  model: string;
  sdkVersion: string;
  fingerprints: AgentFingerprints;
  startedAt: string;
}

export interface AgentJournalEvent {
  runID: string;
  sequence: number;
  kind: "tool_call" | "provider_result" | "terminal";
  occurredAt: string;
  toolName?: string;
  status: string;
  inputFingerprint?: string;
  outputFingerprint?: string;
  metadata: Record<string, unknown>;
}

export interface AgentJournalOutput {
  runID: string;
  status: "validated" | "quarantined";
  outputFingerprint: string;
  structuredOutput: unknown;
  recordedAt: string;
}

export interface AgentTerminalReceipt {
  runID: string;
  status: AgentRunStatus;
  reasonCode: string;
  proposalID: string | null;
  noActionID: string | null;
  candidateFingerprint: string | null;
  externalEffects: [];
  fingerprints: AgentFingerprints;
  usage: AgentUsage;
  permissionDenials: string[];
  providerSessionID: string | null;
  completedAt: string;
}

export interface AgentRunJournal {
  start(input: AgentJournalStart): Promise<void>;
  append(event: AgentJournalEvent): Promise<void>;
  recordOutput(output: AgentJournalOutput): Promise<void>;
  complete(receipt: AgentTerminalReceipt): Promise<AgentTerminalReceipt>;
}

export interface AgentRunRequest {
  definition: AgentDefinition;
  scope: AgentRunScope;
  budget: AgentBudget;
  provider: AgentProvider;
  gateway: AgentCapabilityGateway;
  journal: AgentRunJournal;
  signal?: AbortSignal;
}
