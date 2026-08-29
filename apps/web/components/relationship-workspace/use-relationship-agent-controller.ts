"use client";

import type {
  ChatTaskResponse,
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
        "Contact creation staged",
        "I prepared a reviewable contact draft and will check this account for an existing person before creation is available.",
        "staged",
        submitted,
        contactDraft,
      );
      onAnnouncement("Agent opened a governed contact draft.");
      return true;
    }

    if (command === "add_source") {
      onOpenResourceComposer();
      stageOperation(
        "Source intake opened",
        "The source editor is open on this relationship. Its identity, authority, and deletion path remain explicit.",
        "completed",
        submitted,
      );
      onAnnouncement("Agent opened governed source intake.");
      return true;
    }

    if (command === "review_changes") {
      if (pendingCount === 0) {
        stageOperation(
          "No page changes waiting",
          "The current relationship has no staged facts that require review.",
          "no_change",
          submitted,
        );
        onAnnouncement("No proposed page changes are waiting.");
        return true;
      }
      scrollToWorkspaceSection("proposed-changes");
      stageOperation(
        "Page review opened",
        `${pendingCount} source-linked ${
          pendingCount === 1 ? "change is" : "changes are"
        } waiting on the living page. Agent did not apply them.`,
        "completed",
        submitted,
      );
      onAnnouncement("Agent opened the proposed page changes.");
      return true;
    }

    if (command === "review_duplicate") {
      onOpenMergeReview();
      stageOperation(
        "Duplicate review opened",
        "Choose the other person page to compare. Agent will show relationship ownership, source counts, identity differences, and blockers before any merge is possible.",
        "staged",
        submitted,
      );
      onAnnouncement("Agent opened a reversible duplicate-person review.");
      return true;
    }

    if (command === "open_person") {
      scrollToWorkspaceSection("contact-overview");
      stageOperation(
        "Person page opened",
        "The living page remains the structured, reviewable view of this relationship.",
        "completed",
        submitted,
      );
      onAnnouncement("Agent opened the living person page.");
      return true;
    }

    if (command === "open_next_move") {
      scrollToWorkspaceSection("next-move");
      stageOperation(
        "Next move opened",
        "The action surface is visible. Any consequential effect still requires separate approval.",
        "completed",
        submitted,
      );
      onAnnouncement("Agent opened the next move.");
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
            "I extracted only the visible identity and relationship clues. Account-scoped matching runs before create or attach becomes available.",
          status: "staged",
          title: contactDraft.name
            ? `Contact draft prepared for ${contactDraft.name}`
            : "Contact draft needs a name",
        },
        response: null,
        submittedObjective: submitted,
      });
      requestRef.current = null;
      clearStoredDraft();
      onAnnouncement(
        "Agent prepared a contact draft. Nothing has been created.",
      );
      return;
    }
    if (!scope) {
      onError(
        "Start with a person update, for example “Add Maya Chen for the CPO search…”, or open an existing relationship before asking a scoped question.",
      );
      return;
    }
    if (runUiCommand(submitted)) {
      return;
    }

    const requestConversationKey = conversationKey;
    const requestScope = scope;
    setOperation(null);
    onBusyChange("Compiling a source-linked brief");
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

    try {
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
            : "The source-linked brief could not be compiled.",
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
      clearStoredDraft();
      onAnnouncement(
        "Chat brief compiled from the visible person and relationship context.",
      );
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
          : "The source-linked brief could not be compiled.",
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
