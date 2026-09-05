import type {
  AgentTaskEvent,
  AgentTaskProjection,
} from "@talent-signal/contracts";

export type AgentTaskSemanticBlockKind =
  | "summary"
  | "evidence"
  | "dependency"
  | "next_move"
  | "limitations";

export type AgentTaskSemanticBlock = {
  citationIds: string[];
  id: string;
  kind: AgentTaskSemanticBlockKind;
  status: "forming" | "committed";
  text: string;
  title: string;
};

export type AgentTaskContentFrame = {
  block: Omit<AgentTaskSemanticBlock, "status" | "text">;
  delta?: string;
  operation: "start" | "delta" | "commit";
  type: "content_block";
};

export type AgentTaskStreamFrame =
  | {
      taskId: string;
      type: "stream_open";
    }
  | {
      event: AgentTaskEvent;
      type: "task_event";
    }
  | {
      task: AgentTaskProjection;
      type: "snapshot";
    }
  | AgentTaskContentFrame
  | {
      code: string;
      message: string;
      type: "stream_error";
    };

export type AgentTaskProgressStep = {
  detail: string;
  eventId: string;
  label: string;
  sequence: number;
  status: "complete" | "current" | "attention" | "failed";
};

export type AgentTaskStreamState = {
  blocks: AgentTaskSemanticBlock[];
  connected: boolean;
  latestSequence: number;
  seenEventIds: string[];
  steps: AgentTaskProgressStep[];
  transportError: string | null;
};

const MAX_SEEN_EVENTS = 256;

export function initialAgentTaskStreamState(
  task: AgentTaskProjection | null,
): AgentTaskStreamState {
  return {
    blocks: [],
    connected: false,
    latestSequence: task?.latest_sequence ?? 0,
    seenEventIds: [],
    steps: [],
    transportError: null,
  };
}

function progressStep(event: AgentTaskEvent): AgentTaskProgressStep | null {
  const base = {
    eventId: event.event_id,
    sequence: event.task_sequence,
  };
  switch (event.name) {
    case "task.accepted":
      return {
        ...base,
        detail: `已冻结 ${String(event.public_payload.evidence_reference_count ?? 0)} 条证据引用。`,
        label: "任务范围已接受",
        status: "complete",
      };
    case "run.started":
      return {
        ...base,
        detail: `正在执行第 ${String(event.public_payload.attempt ?? 1)} 次受治理尝试。`,
        label: "运行已开始",
        status: "current",
      };
    case "context.compiled":
      return {
        ...base,
        detail: "只使用冻结快照中仍获授权的关系上下文。",
        label: "上下文已装配",
        status: "complete",
      };
    case "checkpoint.saved":
      return {
        ...base,
        detail: "离开页面后可以从这个边界恢复，不会重新授权任务。",
        label: "恢复点已保存",
        status: "complete",
      };
    case "artifact.ready":
      return {
        ...base,
        detail: "非规范简报已经形成，正在核对它的依据与下一步。",
        label: "简报已形成",
        status: "complete",
      };
    case "clarification.requested":
      return {
        ...base,
        detail: "信息不足以继续，需要补充一项准确事实。",
        label: "等待澄清",
        status: "attention",
      };
    case "decision.requested":
      return {
        ...base,
        detail: "提案没有自动应用；需要在受影响对象上逐项决定。",
        label: "等待你的决定",
        status: "attention",
      };
    case "decision.resolved":
      return {
        ...base,
        detail: "决定已由领域对象记录，Agent 没有扩大权限。",
        label: "决定已记录",
        status: "complete",
      };
    case "task.needs_rebase":
      return {
        ...base,
        detail: "规范状态已经变化；旧快照没有继续执行。",
        label: "需要重新建立快照",
        status: "attention",
      };
    case "task.cancelled":
      return {
        ...base,
        detail: "任务已经停止，未产生外部效果。",
        label: "任务已取消",
        status: "complete",
      };
    case "run.completed":
      return {
        ...base,
        detail: "运行已停在明确的人类决定边界。",
        label: "运行已完成",
        status: "complete",
      };
    case "run.no_action":
      return {
        ...base,
        detail: "当前证据不支持新增动作；这是有效结果。",
        label: "当前无需行动",
        status: "complete",
      };
    case "run.abstained":
      return {
        ...base,
        detail: "系统没有在依据不足时继续推断。",
        label: "已安全停止",
        status: "attention",
      };
    case "run.failed":
      return {
        ...base,
        detail: "运行没有完成，也没有把不确定结果显示为成功。",
        label: "运行失败",
        status: "failed",
      };
  }
  return null;
}

function replaceBlock(
  blocks: AgentTaskSemanticBlock[],
  block: AgentTaskSemanticBlock,
): AgentTaskSemanticBlock[] {
  const existing = blocks.findIndex((item) => item.id === block.id);
  if (existing < 0) return [...blocks, block];
  const next = [...blocks];
  next[existing] = block;
  return next;
}

export function reduceAgentTaskStream(
  state: AgentTaskStreamState,
  frame: AgentTaskStreamFrame,
): AgentTaskStreamState {
  if (frame.type === "stream_open") {
    return { ...state, connected: true, transportError: null };
  }
  if (frame.type === "stream_error") {
    return {
      ...state,
      connected: false,
      transportError: frame.message,
    };
  }
  if (frame.type === "snapshot") {
    return {
      ...state,
      latestSequence: Math.max(
        state.latestSequence,
        frame.task.latest_sequence,
      ),
    };
  }
  if (frame.type === "task_event") {
    if (state.seenEventIds.includes(frame.event.event_id)) return state;
    const step = progressStep(frame.event);
    return {
      ...state,
      latestSequence: Math.max(
        state.latestSequence,
        frame.event.task_sequence,
      ),
      seenEventIds: [...state.seenEventIds, frame.event.event_id].slice(
        -MAX_SEEN_EVENTS,
      ),
      steps: step
        ? [...state.steps.filter((item) => item.eventId !== step.eventId), step]
        : state.steps,
    };
  }

  const existing = state.blocks.find((item) => item.id === frame.block.id);
  if (frame.operation === "start") {
    return {
      ...state,
      blocks: replaceBlock(state.blocks, {
        ...frame.block,
        status: "forming",
        // Content frames intentionally have no SSE id. A reconnect can replay a
        // whole semantic block, so start is also the idempotent reset boundary.
        text: "",
      }),
    };
  }
  if (frame.operation === "delta") {
    const current = existing ?? {
      ...frame.block,
      status: "forming" as const,
      text: "",
    };
    return {
      ...state,
      blocks: replaceBlock(state.blocks, {
        ...current,
        status: "forming",
        text: `${current.text}${frame.delta ?? ""}`,
      }),
    };
  }
  if (!existing) return state;
  return {
    ...state,
    blocks: replaceBlock(state.blocks, {
      ...existing,
      status: "committed",
    }),
  };
}

export function parseAgentTaskStreamCursor(candidate: string | null): number {
  if (!candidate || !/^\d+$/u.test(candidate)) return 0;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function semanticBlocksForTask(
  task: AgentTaskProjection,
): AgentTaskSemanticBlock[] {
  const artifact = task.artifact;
  if (!artifact) return [];
  return [
    {
      citationIds: [],
      id: `${artifact.id}:summary`,
      kind: "summary",
      status: "committed",
      text: artifact.summary,
      title: "简报",
    },
    ...artifact.what_changed.map((claim, index) => ({
      citationIds: claim.evidence_refs,
      id: `${artifact.id}:evidence:${index}`,
      kind: "evidence" as const,
      status: "committed" as const,
      text: claim.statement,
      title: index === 0 ? "发生了什么" : "更多受治理证据",
    })),
    {
      citationIds: artifact.what_matters_now.evidence_refs,
      id: `${artifact.id}:dependency`,
      kind: "dependency",
      status: "committed",
      text: `${artifact.what_matters_now.dependency}\n${artifact.what_matters_now.reason}`,
      title: "当前依赖",
    },
    {
      citationIds: [],
      id: `${artifact.id}:next-move`,
      kind: "next_move",
      status: "committed",
      text: `${artifact.next_move.label}\n${artifact.next_move.reason}`,
      title: "最小安全下一步",
    },
    {
      citationIds: [],
      id: `${artifact.id}:limitations`,
      kind: "limitations",
      status: "committed",
      text: artifact.limitations.join("\n"),
      title: "范围与限制",
    },
  ];
}

export function semanticTextChunks(text: string, targetLength = 56): string[] {
  if (!text) return [];
  const segments = text.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/gu) ?? [text];
  const chunks: string[] = [];
  let pending = "";
  for (const segment of segments) {
    if (pending && pending.length + segment.length > targetLength) {
      chunks.push(pending);
      pending = segment;
    } else {
      pending += segment;
    }
  }
  if (pending) chunks.push(pending);
  return chunks;
}

export function sseFrame(
  event: string,
  value: AgentTaskStreamFrame,
  id?: string,
): string {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
}
