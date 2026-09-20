"use client";

import {
  ArrowLeft,
  ArrowUp,
  Copy,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useWorkspaceChat } from "../relationship-workspace/use-workspace-chat";
import { workspaceSessionFetch } from "@/components/workspace-session-request";

import {
  applyDraftInput,
  applyReload,
  buildSaveRequest,
  canDeleteSession,
  deletedNotice,
  initialDetailState,
  isDetailConflictResponse,
  isDetailGoneResponse,
  markConflict,
  markDeleted,
  markSaveError,
  markSaved,
  markSaving,
  shouldRetainDraftAfterConflict,
  type SaveRequestBody,
  type DetailState,
  type SessionDetail,
} from "./session-detail-state";
import { SessionSaveDrain, type SaveDrainContext } from "./session-save-drain";
import {
  beginPendingSessionDraft,
  clearPendingSessionDraft,
  createPendingSessionDraft,
  pendingSessionDraftRequest,
  prunePendingSessionDrafts,
  readPendingSessionDraft,
  rebasePendingSessionDraft,
  resolvePendingSessionDraft,
  writePendingSessionDraft,
  type PendingSessionDraft,
} from "./session-draft-pending";
import {
  conflictView,
  draftStatusLabel,
  formatSessionTime,
  sessionDisplayTitle,
  sessionExpiryNotice,
  sessionScopeView,
  sessionStateLabel,
  sessionStateNotice,
  shouldPersistDraft,
} from "./session-view";
import styles from "./session-workbench.module.css";
import chatStyles from "./session-conversation.module.css";

const DEBOUNCE_MS = 900;

type Props = {
  accountId?: string;
  chatSessionVersion?: string;
  initialDetail: SessionDetail;
  sessionVersion: string | null;
  initialError: string | null;
  sessionRecoveryHref: string | null;
  storageScope: string;
};

type DetailResponse = {
  code?: string;
  detail?: SessionDetail;
  message?: string;
  session_version?: string;
};

export function SessionWorkbench({
  initialDetail,
  accountId,
  chatSessionVersion,
  sessionVersion,
  initialError,
  sessionRecoveryHref,
  storageScope,
}: Props) {
  const [state, setState] = useState<DetailState>(() =>
    initialDetailState(initialDetail),
  );
  const [binding, setBinding] = useState(sessionVersion);
  const [busy, setBusy] = useState<"reload" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState(initialError ?? "");
  const [sending, setSending] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const sendAttempt = useRef<PendingSessionDraft | null>(null);
  const { ask } = useWorkspaceChat(accountId ?? null, chatSessionVersion ?? null,
    state.detail.state === "active" && state.detail.scope_kind === "unresolved_intent", setNotice);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAttemptRef = useRef<SaveRequestBody | null>(null);
  const pendingDraftRef = useRef<PendingSessionDraft | null>(null);
  const saveDrainRef = useRef(new SessionSaveDrain());
  const deleteKeyRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const bindingRef = useRef(binding);
  stateRef.current = state;
  bindingRef.current = binding;

  const commitState = useCallback((update: (current: DetailState) => DetailState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const detail = state.detail;
  const scope = sessionScopeView({
    contextLabel: detail.context_label,
    personId: detail.person_id,
    personLabel: detail.person_label,
    relationshipContextId: detail.relationship_context_id,
    scopeKind: detail.scope_kind,
    sessionId: detail.session_id,
  });

  const clearDurableDraft = useCallback(
    (expectedIdempotencyKey?: string) => {
      clearPendingSessionDraft(
        storageScope,
        initialDetail.session_id,
        expectedIdempotencyKey,
      );
    },
    [initialDetail.session_id, storageScope],
  );

  useEffect(() => {
    prunePendingSessionDrafts(storageScope);
    const recovered = readPendingSessionDraft(
      storageScope,
      initialDetail.session_id,
    );
    if (!recovered) return;
    if ((recovered as PendingSessionDraft & {purpose?: string}).purpose === "session-send") {
      sendAttempt.current = recovered;
      setSendPending(true);
      commitState(previous => ({ ...previous, draft: recovered.latest.draft, status: "idle" }));
      setNotice("上次发送结果尚未确认。重试会核对同一条消息，不会另建对话。");
      return;
    }
    const resolution = resolvePendingSessionDraft(
      recovered,
      stateRef.current.detail,
    );
    if (resolution.kind === "settled" || resolution.kind === "unavailable") {
      clearDurableDraft(recovered.latest.idempotencyKey);
      return;
    }
    const pending = resolution.kind === "continue" ? resolution.pending : recovered;
    pendingDraftRef.current = pending;
    if (resolution.kind === "continue") writePendingSessionDraft(pending);
    commitState((previous) => {
      const restored = applyDraftInput(previous, pending.latest.draft);
      return resolution.kind === "conflict" ? markConflict(restored) : restored;
    });
    setNotice(
      resolution.kind === "conflict"
        ? "已恢复离开前的本机草稿；服务端版本已变化，不会自动覆盖。"
        : "已恢复离开前尚未确认保存的草稿。",
    );
  }, [clearDurableDraft, commitState, initialDetail.session_id, storageScope]);

  const executePersist = useCallback(
    async ({ force, isCurrent }: SaveDrainContext) => {
      if (sendAttempt.current) return;
      const current = stateRef.current;
      const activeBinding = bindingRef.current;
      if (!activeBinding) return;
      let durablePending = pendingDraftRef.current;
      let request = saveAttemptRef.current;
      if (!request && durablePending?.latest.draft === current.draft) {
        durablePending = beginPendingSessionDraft(
          durablePending,
          current.detail.revision,
        );
        pendingDraftRef.current = durablePending;
        if (!writePendingSessionDraft(durablePending)) {
          setNotice("本机草稿恢复存储不可用；请等待保存完成后再离开。");
        }
        request = pendingSessionDraftRequest(
          durablePending,
          current.detail.revision,
        );
      }
      request ??= buildSaveRequest(
        current,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      if (!request) {
        if (force && current.detail.state === "active") {
          saveAttemptRef.current = null;
          pendingDraftRef.current = null;
          clearDurableDraft();
        }
        return;
      }
      saveAttemptRef.current = request;
      commitState(markSaving);
      try {
        const response = await workspaceSessionFetch(
          `/api/workspace-sessions/${encodeURIComponent(current.detail.session_id)}`,
          {
            body: JSON.stringify(request),
            cache: "no-store",
            headers: {
              "content-type": "application/json",
              "x-workspace-session": activeBinding,
            },
            keepalive: true,
            method: "PUT",
          },
        );
        const payload = (await response.json()) as DetailResponse;
        if (!isCurrent()) return;
        if (payload.session_version) {
          bindingRef.current = payload.session_version;
          setBinding(payload.session_version);
        }
        if (isDetailConflictResponse(response.status)) {
          if (saveAttemptRef.current === request) saveAttemptRef.current = null;
          if (!shouldRetainDraftAfterConflict(response.status, payload.code)) {
            pendingDraftRef.current = null;
            clearDurableDraft();
            setNotice(payload.message || "登录已改变，请重新打开这段对话。");
          }
          commitState(markConflict);
          return;
        }
        if (isDetailGoneResponse(response.status)) {
          if (saveAttemptRef.current === request) saveAttemptRef.current = null;
          pendingDraftRef.current = null;
          clearDurableDraft();
          setNotice(payload.message || "这段对话已删除或过期。");
          try {
            const readback = await readSession(current.detail.session_id, activeBinding);
            if (!isCurrent()) return;
            if (readback) commitState((previous) => markDeleted(previous, readback));
          } catch {
            if (isCurrent()) {
              commitState((previous) =>
                markSaveError(previous, payload.message || "内容不可用。"),
              );
            }
          }
          return;
        }
        if (!response.ok || !payload.detail) {
          throw new Error(payload.message || "保存失败。");
        }
        if (payload.detail.state !== "active") {
          if (saveAttemptRef.current === request) saveAttemptRef.current = null;
          pendingDraftRef.current = null;
          clearDurableDraft();
          commitState((previous) =>
            markDeleted(previous, payload.detail as SessionDetail),
          );
          return;
        }
        if (saveAttemptRef.current === request) saveAttemptRef.current = null;
        const latestPending = pendingDraftRef.current;
        if (latestPending?.latest.idempotencyKey === request.idempotency_key) {
          clearDurableDraft(request.idempotency_key);
          pendingDraftRef.current = null;
        } else if (latestPending) {
          const rebased = rebasePendingSessionDraft(
            latestPending,
            payload.detail.revision,
          );
          pendingDraftRef.current = rebased;
          if (!writePendingSessionDraft(rebased)) {
            setNotice("本机草稿恢复存储不可用；请等待保存完成后再离开。");
          }
        }
        commitState((previous) =>
          markSaved(
            previous,
            payload.detail as SessionDetail,
            request.composer_draft,
          ),
        );
      } catch (caught) {
        if (isCurrent()) {
          commitState((previous) =>
            markSaveError(
              previous,
              caught instanceof Error ? caught.message : "保存失败，草稿仍在本机。",
            ),
          );
        }
      }
    },
    [clearDurableDraft, commitState],
  );

  const persist = useCallback(
    (force = false) => saveDrainRef.current.run(executePersist, force),
    [executePersist],
  );

  const updateDraft = useCallback(
    (value: string) => {
      const current = stateRef.current;
      const next = applyDraftInput(current, value);
      if (next.draft === current.lastSavedDraft) {
        pendingDraftRef.current = null;
        clearDurableDraft();
      } else {
        const pending = createPendingSessionDraft({
          baseRevision: current.detail.revision,
          draft: next.draft,
          idempotencyKey: crypto.randomUUID(),
          predecessor: saveAttemptRef.current,
          sessionId: current.detail.session_id,
          storageScope,
          updatedAt: new Date().toISOString(),
        });
        pendingDraftRef.current = pending;
        if (!writePendingSessionDraft(pending)) {
          setNotice("本机草稿恢复存储不可用；请等待保存完成后再离开。");
        }
      }
      commitState(() => next);
    },
    [clearDurableDraft, commitState, storageScope],
  );

  // Debounced persistence. Lifecycle flush keeps a committed draft from being
  // lost when the tab is backgrounded or removed.
  useEffect(() => {
    if (state.status !== "pending" || sending || sendPending) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist();
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.draft, state.status, persist, sending, sendPending]);

  useEffect(() => {
    const saveDrain = saveDrainRef.current;
    function flush() {
      const current = stateRef.current;
      if (sendAttempt.current) return;
      if (
        current.detail.state === "active" &&
        shouldPersistDraft({
          debounceMs: 0,
          elapsedMs: 0,
          lastSaved: current.lastSavedDraft,
          next: current.draft,
          status: current.status,
        })
      ) {
        void persist();
      }
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      saveDrain.invalidate();
    };
  }, [persist]);

  async function reload() {
    const activeBinding = bindingRef.current;
    if (!activeBinding) return;
    saveDrainRef.current.invalidate();
    setBusy("reload");
    setNotice("");
    try {
      const readback = await readSession(detail.session_id, activeBinding);
      if (readback) {
        commitState((previous) => {
          const next = applyReload(previous, readback);
          saveAttemptRef.current = null;
          deleteKeyRef.current = null;
          return next;
        });
        setNotice("已载入最新版本；你的草稿仍保留在上方输入框中。");
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "无法重新载入。");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (sendAttempt.current || sending) return;
    const activeBinding = bindingRef.current;
    if (!activeBinding) return;
    saveDrainRef.current.invalidate();
    setBusy("delete");
    setNotice("");
    try {
      const response = await workspaceSessionFetch(
        `/api/workspace-sessions/${encodeURIComponent(detail.session_id)}`,
        {
          body: JSON.stringify({
            expected_revision: detail.revision,
            idempotency_key:
              deleteKeyRef.current ??
              (deleteKeyRef.current = crypto.randomUUID()),
          }),
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            "x-workspace-session": activeBinding,
          },
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as DetailResponse;
      if (payload.session_version) {
        bindingRef.current = payload.session_version;
        setBinding(payload.session_version);
      }
      if (isDetailConflictResponse(response.status)) {
        setConfirmingDelete(false);
        deleteKeyRef.current = null;
        commitState(markConflict);
        return;
      }
      if (!response.ok || !payload.detail) {
        throw new Error(payload.message || "删除失败。");
      }
      setConfirmingDelete(false);
      deleteKeyRef.current = null;
      pendingDraftRef.current = null;
      clearDurableDraft();
      commitState((previous) =>
        markDeleted(previous, payload.detail as SessionDetail),
      );
      setNotice(deletedNotice());
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "删除失败。");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage() {
    if (sending || !accountId || !chatSessionVersion || stateRef.current.detail.state !== "active" || stateRef.current.detail.scope_kind !== "unresolved_intent") return;
    const objective = stateRef.current.draft.trim();
    if (!objective || objective.length > 1000 || stateRef.current.conflict) return;
    setSending(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!sendAttempt.current) {
        await persist(true);
        await saveDrainRef.current.whenIdle();
        const current = stateRef.current;
        if (current.conflict || current.status === "error" || current.detail.state !== "active") return;
        sendAttempt.current = { ...createPendingSessionDraft({
          storageScope, sessionId: current.detail.session_id, baseRevision: current.detail.revision,
          draft: objective, idempotencyKey: crypto.randomUUID(), updatedAt: new Date().toISOString(), predecessor: null,
        }), purpose: "session-send" } as PendingSessionDraft;
        if (!writePendingSessionDraft(sendAttempt.current)) {
          sendAttempt.current = null;
          setNotice("无法保存发送状态，请恢复浏览器存储后重试。草稿仍保留。");
          return;
        }
        setSendPending(true);
      }
      const attempt = sendAttempt.current;
      const delivered = await ask(attempt.latest.draft, {
        sessionId: attempt.sessionId, requestId: attempt.latest.idempotencyKey,
      });
      if (!delivered || !bindingRef.current) return;
      const readback = await readSession(attempt.sessionId, bindingRef.current);
      if (!readback) return;
      clearDurableDraft(attempt.latest.idempotencyKey);
      pendingDraftRef.current = null;
      saveAttemptRef.current = null;
      sendAttempt.current = null;
      setSendPending(false);
      commitState(() => initialDetailState(readback));
      updateDraft("");
      await persist(true);
      setNotice("消息已保存。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "发送结果尚未确认，请重试同一条消息。");
    } finally { setSending(false); }
  }

  function endSendRetry() {
    if (sending) return;
    const attempt = sendAttempt.current;
    if (attempt) clearDurableDraft(attempt.latest.idempotencyKey);
    sendAttempt.current = null;
    setSendPending(false);
    setNotice("已结束重试，草稿保留。上一条消息可能已完成，可重新载入核对历史。");
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(state.draft);
      setNotice("草稿已复制到剪贴板。");
    } catch {
      setNotice("无法访问剪贴板，请手动选择并复制草稿。");
    }
  }

  const stateNotice = sessionStateNotice(detail.state);
  const expiryNotice = sessionExpiryNotice(detail.expires_at);
  const statusLabel = draftStatusLabel(state.status);

  return (
    <section aria-labelledby="session-title" className={`${styles.page} ${chatStyles.conversation}`}>
      <Link className={styles.back} href="/workspace/sessions">
        <ArrowLeft aria-hidden="true" size={16} />
        <span>返回对话列表</span>
      </Link>

      <header className={styles.detailHeader}>
        <div>
          <p className={styles.metaLine}>
            {scope.label} · {sessionStateLabel(detail.state)} ·{" "}
            {formatSessionTime(detail.updated_at)}
          </p>
          <h1 className={styles.title} id="session-title">
            {sessionDisplayTitle(detail.title)}
          </h1>
          <p className={styles.disclaimer}>
            对话保留思考过程；资料变更与外部行动仍需单独审阅。
          </p>
        </div>
        {detail.state === "active" ? (
          <div className={styles.detailActions}>
            {confirmingDelete ? (
              <>
                <button
                  className={styles.danger}
                  disabled={busy !== null}
                  onClick={() => void remove()}
                  type="button"
                >
                  {busy === "delete" ? "正在删除…" : "确认删除"}
                </button>
                <button
                  className={styles.secondary}
                  disabled={busy !== null}
                  onClick={() => setConfirmingDelete(false)}
                  type="button"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                className={styles.secondary}
                disabled={!canDeleteSession(state) || sending || sendPending}
                onClick={() => {
                  setConfirmingDelete(true);
                  setNotice(
                    "删除后历史内容不再提供，也无法在本机恢复。请确认要删除这条对话。",
                  );
                }}
                type="button"
              >
                <Trash aria-hidden="true" size={16} />
                <span>删除对话</span>
              </button>
            )}
          </div>
        ) : null}
      </header>

      {stateNotice ? (
        <p className={styles.warning} role="status">
          {stateNotice}
        </p>
      ) : null}
      {expiryNotice && detail.state === "active" ? (
        <p className={styles.hint} role="status">
          {expiryNotice}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
          {sessionRecoveryHref ? (
            <>
              {" "}
              <Link href={sessionRecoveryHref}>重新登录</Link>
            </>
          ) : null}
        </p>
      ) : null}

      {state.conflict ? (
        <div className={styles.conflict} role="alert">
          <Warning aria-hidden="true" size={18} />
          <div>
            <p>{conflictView().message}</p>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={busy !== null}
                onClick={() => void reload()}
                type="button"
              >
                {busy === "reload" ? "正在载入…" : conflictView().reloadLabel}
              </button>
              <button
                className={styles.secondary}
                onClick={() => void copyDraft()}
                type="button"
              >
                <Copy aria-hidden="true" size={16} />
                <span>{conflictView().keepDraftLabel}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section aria-label="对话历史" className={styles.turns}>
        {detail.turns.length === 0 ? (
          <p className={styles.hint}>
            {detail.state === "active"
              ? "这条对话还没有任何回复，也没有范围绑定。你可以在下方写下要保留的内容。"
              : "没有可显示的历史内容。"}
          </p>
        ) : (
          <ol className={styles.turnList}>
            {detail.turns.map((turn) => (
              <li className={styles.turn} key={turn.id}>
                <p className={styles.turnObjective}>{turn.objective}</p>
                <p className={styles.turnMeta}>
                  {formatSessionTime(turn.createdAt)}
                </p>
                {turn.response?.savedBlocks?.length || turn.response?.unboundConversationBlocks?.length ? (
                  <div className={styles.turnBlocks}>
                    {[
                      ...(turn.response?.savedBlocks ?? []),
                      ...(turn.response?.unboundConversationBlocks ?? []),
                    ].map((block) => (
                      <article className={styles.block} key={block.id}>
                        <h3>{block.title}</h3>
                        <p>{block.body}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="草稿" className={`${styles.composer} ${chatStyles.composer}`}>
        <label className={styles.composerLabel} htmlFor="session-composer-draft">
          继续这条对话
        </label>
        <p className={styles.hint}>
          {detail.scope_kind === "unresolved_intent" ? "草稿自动保存 · ⌘ Enter 发送" : "草稿自动保存；前往人物页继续这段关系。"}
        </p>
        <textarea
          aria-describedby="session-draft-status"
          className={styles.textarea}
          disabled={detail.state !== "active"}
          readOnly={sending || sendPending}
          id="session-composer-draft"
          maxLength={12_000}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault(); void sendMessage();
            }
          }}
          placeholder={detail.state === "active" ? "输入消息，或粘贴一段内容…" : "对话不可用，无法编辑草稿。"}
          rows={3}
          value={state.draft}
        />
        <div className={styles.composerFooter}>
          <p
            className={
              state.status === "error" || state.conflict
                ? styles.error
                : styles.status
            }
            id="session-draft-status"
            role={state.status === "error" ? "alert" : "status"}
          >
            {statusLabel}
            {state.error ? ` ${state.error}` : ""}
          </p>
          <div className={styles.actions}>
            {sendPending && !sending ? <button className={styles.secondary} type="button" onClick={endSendRetry}>保留草稿，结束重试</button> : null}
            {accountId && chatSessionVersion && detail.scope_kind === "unresolved_intent" ? <button className={styles.primary} type="button"
              disabled={sending || detail.state !== "active" || state.conflict || !state.draft.trim() || state.draft.trim().length > 1000}
              onClick={() => void sendMessage()}><ArrowUp aria-hidden="true" size={16} />{sending ? "发送中…" : sendPending ? "重试同一条消息" : "发送"}</button> : null}
            <button
              className={styles.secondary}
              disabled={detail.state !== "active" || state.status === "saving" || sending || sendPending}
              onClick={() => void persist(true)}
              type="button"
            >
              立即保存
            </button>
            <button
              className={styles.secondary}
              disabled={detail.state !== "active"}
              onClick={() => void copyDraft()}
              type="button"
            >
              <Copy aria-hidden="true" size={16} />
              <span>复制草稿</span>
            </button>
          </div>
        </div>
      </section>

      <aside className={styles.scopeLink} aria-label="范围与返回">
        <p>{scope.note}</p>
        <Link className={styles.primary} href={scope.returnHref}>
          {scope.returnLabel}
        </Link>
      </aside>
    </section>
  );
}

async function readSession(
  sessionId: string,
  binding: string,
): Promise<SessionDetail | null> {
  const response = await workspaceSessionFetch(
    `/api/workspace-sessions/${encodeURIComponent(sessionId)}`,
    { cache: "no-store", headers: { "x-workspace-session": binding } },
  );
  const payload = (await response.json()) as DetailResponse;
  if (!response.ok || !payload.detail) {
    throw new Error(payload.message || "无法读取这段对话。");
  }
  return payload.detail;
}
