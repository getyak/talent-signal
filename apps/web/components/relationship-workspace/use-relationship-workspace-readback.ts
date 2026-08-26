"use client";

import type {
  RelationshipAgentHistory,
  RelationshipScope,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { relationshipWorkspaceReadbackBoundaryError } from "./relationship-workspace-command";

type ActiveRelationshipScope = Pick<
  RelationshipScope,
  "person" | "relationship_context"
>;

type TaggedHistory = {
  history: RelationshipAgentHistory | null;
  scopeKey: string | null;
};

type ScopedRequest = {
  controller: AbortController;
  key: string;
};

type UseRelationshipWorkspaceReadbackInput = {
  accountId: string | null;
  activeCaptureId: string | null;
  activeScope: ActiveRelationshipScope | null;
  initialHistory: RelationshipAgentHistory | null;
  onWorkspaceReadback: (workspace: WorkspaceReviewResponse) => void;
};

export function relationshipHistoryScopeKey(
  personId: string | null | undefined,
  relationshipContextId: string | null | undefined,
): string | null {
  return personId && relationshipContextId
    ? `${personId}:${relationshipContextId}`
    : null;
}

export function relationshipAgentHistoryMatchesScope(
  history: RelationshipAgentHistory,
  personId: string,
  relationshipContextId: string,
): boolean {
  return (
    history.person_id === personId &&
    history.relationship_context_id === relationshipContextId
  );
}

export function relationshipReadbackRequestIsCurrent(input: {
  aborted: boolean;
  activeKey: string | null;
  requestKey: string;
}): boolean {
  return !input.aborted && input.activeKey === input.requestKey;
}

function taggedHistory(
  history: RelationshipAgentHistory | null,
): TaggedHistory {
  return {
    history,
    scopeKey: history
      ? relationshipHistoryScopeKey(
          history.person_id,
          history.relationship_context_id,
        )
      : null,
  };
}

export function useRelationshipWorkspaceReadback({
  accountId,
  activeCaptureId,
  activeScope,
  initialHistory,
  onWorkspaceReadback,
}: UseRelationshipWorkspaceReadbackInput) {
  const activeScopeKey = relationshipHistoryScopeKey(
    activeScope?.person.id,
    activeScope?.relationship_context.id,
  );
  const [historyState, setHistoryState] = useState(() =>
    taggedHistory(initialHistory),
  );
  const activeScopeKeyRef = useRef(activeScopeKey);
  const activeCaptureIdRef = useRef(activeCaptureId);
  const historyRequestRef = useRef<ScopedRequest | null>(null);
  const workspaceRequestRef = useRef<ScopedRequest | null>(null);

  useLayoutEffect(() => {
    activeScopeKeyRef.current = activeScopeKey;
    activeCaptureIdRef.current = activeCaptureId;
    if (
      historyRequestRef.current &&
      historyRequestRef.current.key !== activeScopeKey
    ) {
      historyRequestRef.current.controller.abort();
    }
    if (
      workspaceRequestRef.current &&
      workspaceRequestRef.current.key !== activeCaptureId
    ) {
      workspaceRequestRef.current.controller.abort();
    }
  }, [activeCaptureId, activeScopeKey]);

  useEffect(
    () => () => {
      historyRequestRef.current?.controller.abort();
      workspaceRequestRef.current?.controller.abort();
    },
    [],
  );

  const clearAgentHistory = useCallback(() => {
    historyRequestRef.current?.controller.abort();
    setHistoryState({ history: null, scopeKey: null });
  }, []);

  const refreshAgentHistory = useCallback(
    async (personId?: string, relationshipContextId?: string) => {
      const resolvedPersonId = personId ?? activeScope?.person.id;
      const resolvedContextId =
        relationshipContextId ?? activeScope?.relationship_context.id;
      const requestKey = relationshipHistoryScopeKey(
        resolvedPersonId,
        resolvedContextId,
      );
      if (!resolvedPersonId || !resolvedContextId || !requestKey) {
        return false;
      }

      historyRequestRef.current?.controller.abort();
      const controller = new AbortController();
      historyRequestRef.current = { controller, key: requestKey };
      try {
        const response = await fetch(
          `/api/local-integration/people/${encodeURIComponent(
            resolvedPersonId,
          )}/contexts/${encodeURIComponent(
            resolvedContextId,
          )}/agent-history`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as
          | RelationshipAgentHistory
          | { message?: string };
        if (
          !response.ok ||
          !("operations" in payload) ||
          !relationshipAgentHistoryMatchesScope(
            payload,
            resolvedPersonId,
            resolvedContextId,
          ) ||
          !relationshipReadbackRequestIsCurrent({
            aborted: controller.signal.aborted,
            activeKey: activeScopeKeyRef.current,
            requestKey,
          })
        ) {
          return false;
        }
        setHistoryState({ history: payload, scopeKey: requestKey });
        return true;
      } catch {
        // A failed or superseded refresh never replaces verified history.
        return false;
      }
    },
    [activeScope],
  );

  const acceptWorkspaceReadback = useCallback(
    (
      next: WorkspaceReviewResponse,
      expectedCaptureId: string,
    ): { message?: string; ok: boolean } => {
      const boundaryError = relationshipWorkspaceReadbackBoundaryError(next, {
        expectedAccountId: accountId,
        expectedCaptureId,
      });
      if (boundaryError) {
        return { message: boundaryError, ok: false };
      }
      if (activeCaptureIdRef.current !== expectedCaptureId) {
        return {
          message:
            "The requested review is no longer active. Its late readback was ignored.",
          ok: false,
        };
      }
      onWorkspaceReadback(next);
      return { ok: true };
    },
    [accountId, onWorkspaceReadback],
  );

  const refreshWorkspaceReview = useCallback(
    async (captureId: string) => {
      workspaceRequestRef.current?.controller.abort();
      const controller = new AbortController();
      workspaceRequestRef.current = { controller, key: captureId };
      try {
        const response = await fetch(
          `/api/local-integration/workspace?capture_id=${encodeURIComponent(
            captureId,
          )}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json()) as
          | WorkspaceReviewResponse
          | { message?: string };
        if (
          !response.ok ||
          !("capture" in payload) ||
          controller.signal.aborted
        ) {
          return false;
        }
        return acceptWorkspaceReadback(payload, captureId).ok;
      } catch {
        // Keep the last verified review visible when refresh is unavailable.
        return false;
      }
    },
    [acceptWorkspaceReadback],
  );

  const initialHistoryState = taggedHistory(initialHistory);
  const agentHistory =
    historyState.scopeKey === activeScopeKey
      ? historyState.history
      : initialHistoryState.scopeKey === activeScopeKey
        ? initialHistoryState.history
        : null;

  return {
    acceptWorkspaceReadback,
    agentHistory,
    clearAgentHistory,
    refreshAgentHistory,
    refreshWorkspaceReview,
  };
}
