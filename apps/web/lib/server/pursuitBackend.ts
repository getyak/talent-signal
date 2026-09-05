import "server-only";

import {
  TalentSignalClient,
  type AgentTaskProjection,
  type CancelAgentTaskRequest,
  type CreatePursuitAgentTaskRequest,
  type CreatePursuitAgentRunRequest,
  type ReviewPursuitProposalRequest,
  type ResolveAgentDecisionBundleRequest,
} from "@talent-signal/contracts";

import {
  semanticBlocksForTask,
  semanticTextChunks,
  sseFrame,
  type AgentTaskContentFrame,
  type AgentTaskStreamFrame,
} from "../agentTaskStream";

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

const STREAM_TERMINAL_STATUSES = new Set<AgentTaskProjection["status"]>([
  "waiting_for_clarification",
  "waiting_for_domain_decision",
  "waiting_for_external",
  "needs_rebase",
  "completed",
  "no_action",
  "abstained",
  "failed",
  "cancelled",
  "expired",
]);

function streamDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function createPursuitAgentTaskEventStream(
  taskId: string,
  afterSequence: number,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const client = await authenticatedClient("web-pursuit-agent-task-stream");
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, frame: AgentTaskStreamFrame, id?: string) => {
        if (!closed && !signal.aborted) {
          controller.enqueue(encoder.encode(sseFrame(event, frame, id)));
        }
      };
      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
      const streamSemanticBlocks = async (task: AgentTaskProjection) => {
        for (const item of semanticBlocksForTask(task)) {
          if (signal.aborted) return;
          const block = {
            citationIds: item.citationIds,
            id: item.id,
            kind: item.kind,
            title: item.title,
          };
          send("content-block", {
            block,
            operation: "start",
            type: "content_block",
          });
          for (const delta of semanticTextChunks(item.text)) {
            send("content-block", {
              block,
              delta,
              operation: "delta",
              type: "content_block",
            } satisfies AgentTaskContentFrame);
            await streamDelay(18, signal);
          }
          send("content-block", {
            block,
            operation: "commit",
            type: "content_block",
          });
        }
      };

      void (async () => {
        let cursor = Math.max(0, afterSequence);
        let needsInitialSnapshot = true;
        let lastHeartbeat = Date.now();
        const openedAt = Date.now();
        try {
          const initial = await client.getAgentTask(taskId);
          if (initial.task.id !== taskId) {
            throw new Error("The streamed Agent Task readback did not match its route.");
          }
          send("stream-open", { taskId, type: "stream_open" });

          while (!signal.aborted && Date.now() - openedAt < 25_000) {
            const batch = await client.getAgentTaskEvents(taskId, cursor);
            let needsSnapshot = needsInitialSnapshot;
            needsInitialSnapshot = false;
            for (const event of batch.events) {
              if (event.task_sequence <= cursor) continue;
              if (event.name === "artifact.ready") {
                const readback = await client.getAgentTask(taskId);
                await streamSemanticBlocks(readback.task);
              }
              send(
                "task-event",
                { event, type: "task_event" },
                String(event.task_sequence),
              );
              cursor = event.task_sequence;
              needsSnapshot = true;
            }

            if (needsSnapshot) {
              const readback = await client.getAgentTask(taskId);
              send("task-snapshot", {
                task: readback.task,
                type: "snapshot",
              });
              if (STREAM_TERMINAL_STATUSES.has(readback.task.status)) {
                close();
                return;
              }
            }
            if (Date.now() - lastHeartbeat >= 10_000) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              lastHeartbeat = Date.now();
            }
            await streamDelay(450, signal);
          }
          close();
        } catch {
          send("stream-error", {
            code: "AGENT_TASK_STREAM_UNAVAILABLE",
            message: "任务事件流暂时中断；正在从规范任务状态恢复。",
            type: "stream_error",
          });
          close();
        }
      })();
    },
  });
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
