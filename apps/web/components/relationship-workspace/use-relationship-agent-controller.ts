"use client";

import type {
  ChatTaskResponse,
  KnowledgeSnapshot,
  RelationshipScope,
} from "@talent-signal/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { resolveAgentUiCommand } from "@/lib/agent-ui-command";
import {
  proposeAgentContactDraft,
  type AgentContactDraft,
} from "@/lib/agent-contact-intake";
import { relationshipIntegrationFetch } from "@/components/workspace-session-request";
import {
  appendWebTrace,
  beginWebTrace,
  completeWebTrace,
  traceSpanId,
  type WebTraceHandle,
} from "@/lib/telemetry";

const DEFAULT_OBJECTIVE = "";
const DRAFT_PREFIX = "talent-signal:relationship-agent-draft:v1";
const DRAFT_EVENT = "talent-signal:relationship-agent-draft";

export type RelationshipAgentOperation = {
  detail: string;
  status: "completed" | "no_change" | "staged";
  title: string;
};

type ConversationState = {
  contactDraft: AgentContactDraft | null;
  createOpen: boolean;
  key: string;
  operation: RelationshipAgentOperation | null;
  response: ChatTaskResponse | null;
  submittedObjective: string;
};

function emptyConversation(key: string): ConversationState {
  return {
    contactDraft: null,
    createOpen: false,
    key,
    operation: null,
    response: null,
    submittedObjective: "",
  };
}

type ControllerOptions = {
  accountId: string | null;
  onAnnouncement: (message: string) => void;
  onBusyChange: (label: string) => void;
  onError: (message: string) => void;
  onKnowledgeCompiled: (snapshot: KnowledgeSnapshot) => void;
  onOpenMergeReview: () => void;
  onOpenResourceComposer: () => void;
  onRefreshHistory: (personId: string, relationshipContextId: string) => void;
  pendingCount: number;
  scope: Pick<RelationshipScope, "person" | "relationship_context"> | null;
};

export function relationshipAgentScopeKey({
  accountId,
  scope,
}: Pick<ControllerOptions, "accountId" | "scope">) {
  if (!accountId || !scope) {
    return null;
  }
  return `${accountId}:${scope.person.id}:${scope.relationship_context.id}`;
}

export function relationshipAgentConversationKey({
  accountId,
  scope,
}: Pick<ControllerOptions, "accountId" | "scope">) {
  return (
    relationshipAgentScopeKey({ accountId, scope }) ??
    (scope
      ? `volatile:${scope.person.id}:${scope.relationship_context.id}`
      : "unscoped")
  );
}

export function relationshipAgentDraftStorageKey(scopeKey: string) {
  return `${DRAFT_PREFIX}:${scopeKey}`;
}

export function relationshipAgentResponseIsCurrent({
  aborted,
  activeKey,
  requestKey,
}: {
  aborted: boolean;
  activeKey: string;
  requestKey: string;
}) {
  return !aborted && activeKey === requestKey;
}

function scrollToWorkspaceSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function useRelationshipAgentController({
  accountId,
  onAnnouncement,
  onBusyChange,
  onError,
  onKnowledgeCompiled,
  onOpenMergeReview,
  onOpenResourceComposer,
  onRefreshHistory,
  pendingCount,
  scope,
}: ControllerOptions) {
  const requestRef = useRef<{
    key: string;
    objective: string;
    requestId: string;
  } | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const wikiRequestRef = useRef<{ key: string; requestId: string } | null>(
    null,
  );
  const scopeKey = relationshipAgentScopeKey({ accountId, scope });
  const conversationKey = relationshipAgentConversationKey({
    accountId,
    scope,
  });
  const conversationKeyRef = useRef(conversationKey);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    emptyConversation(conversationKey),
  );
  const currentConversation =
    conversation.key === conversationKey
      ? conversation
      : emptyConversation(conversationKey);
  const [volatileDraft, setVolatileDraft] = useState({
    key: conversationKey,
    value: DEFAULT_OBJECTIVE,
  });

  const subscribeDraft = useCallback(
    (notify: () => void) => {
      if (!scopeKey) {
        return () => undefined;
      }
      const storageKey = relationshipAgentDraftStorageKey(scopeKey);
      const handleStorage = (event: StorageEvent) => {
        if (event.storageArea === window.sessionStorage && event.key === storageKey) {
          notify();
        }
      };
      const handleLocalDraft = (event: Event) => {
        if (
          event instanceof CustomEvent &&
          event.detail === storageKey
        ) {
          notify();
        }
      };
      window.addEventListener("storage", handleStorage);
      window.addEventListener(DRAFT_EVENT, handleLocalDraft);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(DRAFT_EVENT, handleLocalDraft);
      };
    },
    [scopeKey],
  );
  const readStoredDraft = useCallback(() => {
    if (!scopeKey) {
      return DEFAULT_OBJECTIVE;
    }
    try {
      const restored = window.sessionStorage.getItem(
        relationshipAgentDraftStorageKey(scopeKey),
      );
      return restored?.trim() ? restored : DEFAULT_OBJECTIVE;
    } catch {
      return DEFAULT_OBJECTIVE;
    }
  }, [scopeKey]);
  const storedDraft = useSyncExternalStore(
    subscribeDraft,
    readStoredDraft,
    () => DEFAULT_OBJECTIVE,
  );
  const objective = scopeKey
    ? storedDraft
    : volatileDraft.key === conversationKey
      ? volatileDraft.value
      : DEFAULT_OBJECTIVE;

  useEffect(() => {
    conversationKeyRef.current = conversationKey;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    onBusyChange("");
    return () => {
      requestAbortRef.current?.abort();
    };
  }, [conversationKey, onBusyChange]);

  function updateConversation(patch: Partial<Omit<ConversationState, "key">>) {
    setConversation((current) => ({
      ...(current.key === conversationKey
        ? current
        : emptyConversation(conversationKey)),
      ...patch,
      key: conversationKey,
    }));
  }

  function clearStoredDraft() {
    if (!scopeKey) {
      setVolatileDraft({ key: conversationKey, value: DEFAULT_OBJECTIVE });
      return;
    }
    try {
      window.sessionStorage.removeItem(
        relationshipAgentDraftStorageKey(scopeKey),
      );
      window.dispatchEvent(
        new CustomEvent(DRAFT_EVENT, {
          detail: relationshipAgentDraftStorageKey(scopeKey),
        }),
      );
    } catch {
      // Session-only recovery is optional; the visible draft remains usable.
    }
  }

  function setObjective(next: string) {
    requestRef.current = null;
    if (!scopeKey) {
      setVolatileDraft({ key: conversationKey, value: next });
      return;
    }
    try {
      const storageKey = relationshipAgentDraftStorageKey(scopeKey);
      if (!next.trim() || next === DEFAULT_OBJECTIVE) {
        window.sessionStorage.removeItem(storageKey);
      } else {
        window.sessionStorage.setItem(storageKey, next);
      }
      window.dispatchEvent(
        new CustomEvent(DRAFT_EVENT, { detail: storageKey }),
      );
    } catch {
      // A storage failure cannot block the current in-memory question.
    }
  }

  function clearGeneratedArtifacts() {
    updateConversation({ response: null });
    requestRef.current = null;
  }

  function setCreateOpen(next: boolean) {
    updateConversation({
      contactDraft: next ? currentConversation.contactDraft : null,
      createOpen: next,
    });
  }

  function setOperation(
    next: RelationshipAgentOperation | null,
    target?: Pick<ControllerOptions, "accountId" | "scope">,
  ) {
    if (!target) {
      updateConversation({ operation: next });
      return;
    }
    const targetKey = relationshipAgentConversationKey(target);
    setConversation((current) => ({
      ...(current.key === targetKey ? current : emptyConversation(targetKey)),
      key: targetKey,
      operation: next,
    }));
  }

  function stageOperation(
    title: string,
    detail: string,
    status: RelationshipAgentOperation["status"],
    submitted = objective.trim(),
    contactDraft: AgentContactDraft | null = null,
  ) {
    updateConversation({
      contactDraft,
      operation: { detail, status, title },
      response: null,
      submittedObjective: submitted,
    });
    requestRef.current = null;
    clearStoredDraft();
  }

  function runUiCommand(commandObjective: string) {
    const command = resolveAgentUiCommand(commandObjective);
    const submitted = commandObjective.trim();

    if (command === "create_person") {
      const contactDraft = proposeAgentContactDraft(submitted);
      updateConversation({
        contactDraft,
        createOpen: true,
      });
      stageOperation(
        "联系人创建已暂存",
        "我已准备一份可审阅的联系人草稿，并会先在此账号中检查是否已有对应联系人，再开放创建。",
        "staged",
        submitted,
        contactDraft,
      );
      onAnnouncement("智能助理已打开受治理的联系人草稿。");
      return true;
    }

    if (command === "add_source") {
      onOpenResourceComposer();
      stageOperation(
        "来源采集已打开",
        "来源编辑器已在此关系中打开，其身份、权限与删除路径保持明确。",
        "completed",
        submitted,
      );
      onAnnouncement("智能助理已打开受治理的来源采集。");
      return true;
    }

    if (command === "review_changes") {
      if (pendingCount === 0) {
        stageOperation(
          "没有待审阅页面变化",
          "当前关系中没有需要审阅的暂存事实。",
          "no_change",
          submitted,
        );
        onAnnouncement("没有拟议页面变化正在等待审阅。");
        return true;
      }
      scrollToWorkspaceSection("proposed-changes");
      stageOperation(
        "页面审阅已打开",
        `${pendingCount} source-linked ${
          pendingCount === 1 ? "change is" : "changes are"
        } waiting on the living page. Agent did not apply them.`,
        "completed",
        submitted,
      );
      onAnnouncement("智能助理已打开拟议页面变化。");
      return true;
    }

    if (command === "review_duplicate") {
      onOpenMergeReview();
      stageOperation(
        "重复联系人审阅已打开",
        "选择另一张人物页面进行比较。合并开放前，智能助理会展示关系归属、来源数量、身份差异与阻碍。",
        "staged",
        submitted,
      );
      onAnnouncement("智能助理已打开可逆的重复人物审阅。");
      return true;
    }

    if (command === "open_person") {
      scrollToWorkspaceSection("contact-overview");
      stageOperation(
        "人物页面已打开",
        "持续更新页面仍是此关系的结构化、可审阅视图。",
        "completed",
        submitted,
      );
      onAnnouncement("智能助理已打开持续更新的人物页面。");
      return true;
    }

    if (command === "open_next_move") {
      scrollToWorkspaceSection("next-move");
      stageOperation(
        "下一步已打开",
        "行动界面现已可见。任何重要效果仍需单独批准。",
        "completed",
        submitted,
      );
      onAnnouncement("智能助理已打开下一步。");
      return true;
    }

    return false;
  }

  async function ask() {
    if (!objective.trim()) return;
    const submitted = objective.trim();
    const contactDraft = proposeAgentContactDraft(submitted);
    if (contactDraft) {
      updateConversation({
        contactDraft,
        createOpen: true,
        operation: {
          detail:
            "我只提取了可见的身份与关系线索。在开放创建或关联前，会先进行账号范围内匹配。",
          status: "staged",
          title: contactDraft.name
            ? `已为 ${contactDraft.name} 准备联系人草稿`
            : "联系人草稿需要姓名",
        },
        response: null,
        submittedObjective: submitted,
      });
      requestRef.current = null;
      clearStoredDraft();
      onAnnouncement(
        "智能助理已准备联系人草稿，尚未创建任何内容。",
      );
      return;
    }
    if (!scope) {
      onError(
        "请先提供一条人物更新，例如“添加 Maya Chen 到首席产品官寻访……”，或先打开现有关系，再提出范围明确的问题。",
      );
      return;
    }
    if (runUiCommand(submitted)) {
      return;
    }

    const requestConversationKey = conversationKey;
    const requestScope = scope;
    setOperation(null);
    onBusyChange("正在编译关联来源的简报");
    onError("");
    if (
      requestRef.current?.key !== requestConversationKey ||
      requestRef.current.objective !== submitted
    ) {
      requestRef.current = {
        key: requestConversationKey,
        objective: submitted,
        requestId: crypto.randomUUID(),
      };
    }
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    let trace: WebTraceHandle | null = null;
    const apiStartedAt = new Date().toISOString();

    try {
      trace = await beginWebTrace({
        name: "relationship.agent.submit",
        route: "/workspace",
        text: submitted,
        dataClassification: "private_relationship",
        authorizationScope: `person:${requestScope.person.id}:relationship-context:${requestScope.relationship_context.id}`,
        attributes: {
          "ts.ui.event": "agent_submission_started",
          "ts.objective.length": submitted.length,
          "ts.relationship.context_id": requestScope.relationship_context.id,
        },
      });
      const responseResult = await relationshipIntegrationFetch(
        "/api/local-integration/chat",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            request_id: requestRef.current.requestId,
            person_id: requestScope.person.id,
            relationship_context_id: requestScope.relationship_context.id,
            objective: submitted,
            telemetry: {
              trace_id: trace.trace_id,
              parent_span_id: trace.root_span_id,
              interaction_id: trace.interaction_id,
            },
          }),
        },
      );
      const payload = (await responseResult.json()) as
        | ChatTaskResponse
        | { message?: string };
      if (!responseResult.ok || !("blocks" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "无法编译关联来源的简报。",
        );
      }
      if (
        !relationshipAgentResponseIsCurrent({
          aborted: controller.signal.aborted,
          activeKey: conversationKeyRef.current,
          requestKey: requestConversationKey,
        })
      ) {
        return;
      }
      updateConversation({
        response: payload,
        submittedObjective: submitted,
      });
      const endedAt = new Date().toISOString();
      await appendWebTrace(trace, {
        spans: [
          {
            span_id: traceSpanId(trace, "relationship-chat-api"),
            parent_span_id: trace.root_span_id,
            name: "http POST /api/local-integration/chat",
            kind: "client",
            status: "ok",
            started_at: apiStartedAt,
            ended_at: endedAt,
            attributes: {
              "http.request.method": "POST",
              "http.route": "/api/local-integration/chat",
              "http.response.status_code": responseResult.status,
              "ts.chat.task_id": payload.task_id,
              "ts.chat.disposition": payload.disposition,
            },
            artifact_refs: trace.artifact_ids,
            agent_run_id: null,
            agent_event_sequence: null,
          },
        ],
        events: [
          {
            event_id: crypto.randomUUID(),
            span_id: trace.root_span_id,
            name: "agent_result_rendered",
            occurred_at: endedAt,
            attributes: {
              "ts.chat.task_id": payload.task_id,
              "ts.chat.disposition": payload.disposition,
              "ts.chat.block_count": payload.blocks.length,
            },
            artifact_refs: trace.artifact_ids,
          },
        ],
      });
      await completeWebTrace(trace, {
        status: "ok",
        attributes: {
          "ts.chat.task_id": payload.task_id,
          "ts.chat.disposition": payload.disposition,
        },
      });
      clearStoredDraft();
      onAnnouncement(
        "聊天简报已根据当前可见人物与关系情境编译。",
      );
      onRefreshHistory(
        requestScope.person.id,
        requestScope.relationship_context.id,
      );
    } catch (caught) {
      if (controller.signal.aborted) {
        if (trace) {
          await completeWebTrace(trace, {
            status: "cancelled",
            errorCode: "REQUEST_CANCELLED",
          }).catch(() => undefined);
        }
        return;
      }
      if (trace) {
        await appendWebTrace(trace, {
          spans: [
            {
              span_id: traceSpanId(trace, "relationship-chat-api-error"),
              parent_span_id: trace.root_span_id,
              name: "http POST /api/local-integration/chat",
              kind: "client",
              status: "error",
              started_at: apiStartedAt,
              ended_at: new Date().toISOString(),
              attributes: { "error.type": "relationship_chat_failed" },
              artifact_refs: trace.artifact_ids,
              agent_run_id: null,
              agent_event_sequence: null,
            },
          ],
          events: [],
        }).catch(() => undefined);
        await completeWebTrace(trace, {
          status: "error",
          errorCode: "RELATIONSHIP_CHAT_FAILED",
        }).catch(() => undefined);
      }
      onError(
        caught instanceof Error
          ? caught.message
          : "无法编译关联来源的简报。",
      );
    } finally {
      if (
        requestAbortRef.current === controller &&
        conversationKeyRef.current === requestConversationKey
      ) {
        requestAbortRef.current = null;
        onBusyChange("");
      }
    }
  }

  async function compileWiki() {
    if (!scope) {
      onError("请先打开一段人物关系，再编译关系 Wiki。");
      return;
    }
    const requestConversationKey = conversationKey;
    const requestScope = scope;
    if (wikiRequestRef.current?.key !== requestConversationKey) {
      wikiRequestRef.current = {
        key: requestConversationKey,
        requestId: crypto.randomUUID(),
      };
    }
    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    onBusyChange("正在编译关联来源的简报");
    onError("");
    try {
      const result = await relationshipIntegrationFetch(
        "/api/local-integration/wiki-compilations",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            request_id: wikiRequestRef.current.requestId,
            person_id: requestScope.person.id,
            relationship_context_id: requestScope.relationship_context.id,
          }),
        },
      );
      const payload = (await result.json()) as
        | KnowledgeSnapshot
        | { message?: string };
      if (!result.ok || !("blocks" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "无法编译关系 Wiki。",
        );
      }
      if (
        !relationshipAgentResponseIsCurrent({
          aborted: controller.signal.aborted,
          activeKey: conversationKeyRef.current,
          requestKey: requestConversationKey,
        })
      ) {
        return;
      }
      onKnowledgeCompiled(payload);
      updateConversation({
        operation: {
          detail:
            "已从当前仍获授权的来源编译快照；事实审阅与外部行动权限没有改变。",
          status: "completed",
          title: "关系 Wiki 已编译",
        },
        response: null,
        submittedObjective: "编译当前关系 Wiki",
      });
      wikiRequestRef.current = null;
      onAnnouncement("关系 Wiki 已根据当前授权来源编译。");
      onRefreshHistory(
        requestScope.person.id,
        requestScope.relationship_context.id,
      );
    } catch (caught) {
      if (controller.signal.aborted) {
        return;
      }
      onError(
        caught instanceof Error
          ? caught.message
          : "无法编译关系 Wiki。之前已验证的状态保持不变。",
      );
    } finally {
      if (
        requestAbortRef.current === controller &&
        conversationKeyRef.current === requestConversationKey
      ) {
        requestAbortRef.current = null;
        onBusyChange("");
      }
    }
  }

  return {
    ask,
    compileWiki,
    clearGeneratedArtifacts,
    contactDraft: currentConversation.contactDraft,
    createOpen: currentConversation.createOpen,
    objective,
    operation: currentConversation.operation,
    response: currentConversation.response,
    runUiCommand,
    setCreateOpen,
    setObjective,
    setOperation,
    submittedObjective: currentConversation.submittedObjective,
  };
}
