import "server-only";

import {
  TalentSignalClient,
  type CreatePursuitAgentRunRequest,
  type ReviewPursuitProposalRequest,
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

export async function loadPursuitRoom(pursuitId: string) {
  const client = await authenticatedClient("web-pursuit-room");
  const [detail, proposals] = await Promise.all([
    client.getPursuit(pursuitId),
    client.listPursuitProposals(),
  ]);
  return {
    pursuit: detail.pursuit,
    proposals: proposals.proposals.filter(
      (proposal) => proposal.pursuit_id === pursuitId,
    ),
  };
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
