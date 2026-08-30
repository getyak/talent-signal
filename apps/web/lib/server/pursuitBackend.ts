import "server-only";

import {
  TalentSignalClient,
  type CancelAgentTaskRequest,
  type CreatePursuitAgentTaskRequest,
  type CreatePursuitAgentRunRequest,
  type ReviewPursuitProposalRequest,
  type ResolveAgentDecisionBundleRequest,
} from "@talent-signal/contracts";

import {
  buildPursuitTodayProjection,
  limitPursuitTodayProjection,
  TODAY_FOCUSED_ITEM_LIMIT,
} from "../pursuitToday";
import { authenticatedBackendClient as signedInBackendClient } from "./backendAuth";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULT_ACCOUNT_SLUG = "fixture-alpha";
const DEFAULT_USER_EMAIL = "recruiter@alpha.local";

function backendUrl(): URL {
  const parsed = new URL(
    process.env.TALENT_SIGNAL_BACKEND_URL?.trim() ??
      "http://127.0.0.1:4317",
  );
  if (parsed.protocol === "https:") return parsed;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return parsed;
  }
  throw new Error(
    "The Pursuit backend must use HTTPS, except for an explicit loopback integration.",
  );
}

export function isPursuitIntegrationMode(): boolean {
  const configured = process.env.TALENT_SIGNAL_INTEGRATION_MODE;
  return (
    configured === "true" ||
    (process.env.NODE_ENV !== "production" && configured !== "false")
  );
}

async function authenticatedClient(label: string): Promise<TalentSignalClient> {
  const signedIn = await signedInBackendClient();
  if (signedIn) return signedIn;

  const url = backendUrl();
  if (!LOOPBACK_HOSTS.has(url.hostname) || !isPursuitIntegrationMode()) {
    throw new Error(
      "Production Web-to-backend identity exchange is not configured. No shared account is assumed.",
    );
  }
  const client = new TalentSignalClient(url.origin);
  await client.login({
    account_slug:
      process.env.TALENT_SIGNAL_BACKEND_ACCOUNT_SLUG ?? DEFAULT_ACCOUNT_SLUG,
    user_email:
      process.env.TALENT_SIGNAL_BACKEND_USER_EMAIL ?? DEFAULT_USER_EMAIL,
    client_label: label,
  });
  return client;
}

export async function loadPursuitToday(options: { expanded?: boolean } = {}) {
  const client = await authenticatedClient("web-pursuit-today");
  const [pursuits, proposals] = await Promise.all([
    client.listPursuits(),
    client.listPursuitProposals(),
  ]);
  if (pursuits.workspace_id !== proposals.workspace_id) {
    throw new Error("寻访项目与提案的读回结果来自不同工作区。");
  }
  const projection = buildPursuitTodayProjection(
    pursuits.workspace_id,
    pursuits.pursuits,
    proposals.proposals,
  );
  return {
    projection: options.expanded
      ? projection
      : limitPursuitTodayProjection(
          projection,
          TODAY_FOCUSED_ITEM_LIMIT,
        ),
    providerMode:
      process.env.TALENT_SIGNAL_AGENT_PROVIDER === "openrouter" ||
      process.env.TALENT_SIGNAL_AGENT_PROVIDER === "zhipu"
        ? ("live_remote" as const)
        : ("safe_deterministic" as const),
  };
}

export async function loadEvalAgentLab() {
  const data = await loadPursuitToday({ expanded: true });
  const provider = process.env.TALENT_SIGNAL_AGENT_PROVIDER ?? "deterministic";
  const model =
    process.env.TALENT_SIGNAL_AGENT_MODEL ?? "talent-signal-no-action-v1";
  const bigModelVision =
    provider === "zhipu" && /^glm-(?:\d+(?:\.\d+)?v|4v)/u.test(model);
  const openRouterVision =
    provider === "openrouter" &&
    process.env.TALENT_SIGNAL_AGENT_IMAGE_INPUT_ENABLED === "true";
  const imageUnderstanding = bigModelVision || openRouterVision;
  return {
    targets: data.projection.items.flatMap((item) =>
      item.agentContext
        ? [
            {
              pursuitId: item.pursuitId,
              title: item.title,
              displayRef: item.pursuitId.slice(0, 8),
              revision: item.revision,
              captureId: item.agentContext.captureId,
              evidenceRefs: item.agentContext.evidenceRefs,
              evidenceCount: item.agentContext.evidenceRefs.length,
            },
          ]
        : [],
    ),
    provider: {
      id: provider,
      model,
      mode: provider === "deterministic" ? "routing_only" : "live_model",
      acceptsImages:
        provider === "deterministic" || imageUnderstanding,
      imageUnderstanding,
    },
  } as const;
}

export async function loadPursuitRoom(pursuitId: string) {
  const client = await authenticatedClient("web-pursuit-room");
  const [detail, proposals, agentTasks] = await Promise.all([
    client.getPursuit(pursuitId),
    client.listPursuitProposals(),
    client.listPursuitAgentTasks(pursuitId, "all"),
  ]);
  const pursuitProposals = proposals.proposals.filter(
    (proposal) => proposal.pursuit_id === pursuitId,
  );
  const contextProposal = pursuitProposals.find(
    (proposal) =>
      proposal.evidence_state.availability === "available" &&
      proposal.items.some((item) => item.evidence_refs.length > 0),
  );
  const evidenceRefs = contextProposal
    ? [...new Set(contextProposal.items.flatMap((item) => item.evidence_refs))]
    : [];
  return {
    pursuit: detail.pursuit,
    proposals: pursuitProposals,
    agentTasks: agentTasks.tasks,
    agentContext:
      contextProposal && evidenceRefs.length > 0
        ? { captureId: contextProposal.capture_id, evidenceRefs }
        : null,
  };
}

export async function createPursuitAgentTask(
  pursuitId: string,
  request: CreatePursuitAgentTaskRequest,
) {
  const client = await authenticatedClient("web-pursuit-agent-task");
  return client.createPursuitAgentTask(pursuitId, request);
}

export async function getPursuitAgentTask(taskId: string) {
  const client = await authenticatedClient("web-pursuit-agent-task-readback");
  return client.getAgentTask(taskId);
}

export async function cancelPursuitAgentTask(
  taskId: string,
  request: CancelAgentTaskRequest,
) {
  const client = await authenticatedClient("web-pursuit-agent-task-cancel");
  return client.cancelAgentTask(taskId, request);
}

export async function createPursuitAgentRun(
  pursuitId: string,
  request: CreatePursuitAgentRunRequest,
) {
  const client = await authenticatedClient("web-pursuit-agent-run");
  return client.createPursuitAgentRun(pursuitId, request);
}

export async function reviewPursuitProposal(
  proposalId: string,
  request: ReviewPursuitProposalRequest,
) {
  const client = await authenticatedClient("web-pursuit-proposal-review");
  return client.reviewPursuitProposal(proposalId, request);
}

export async function resolveAgentDecisionBundle(
  bundleId: string,
  request: ResolveAgentDecisionBundleRequest,
) {
  const client = await authenticatedClient("web-agent-decision-resolution");
  return client.resolveAgentDecisionBundle(bundleId, request);
}
