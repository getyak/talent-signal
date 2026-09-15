"use client";

import {
  ArrowLeft,
  Copy,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  type DetailState,
  type SessionDetail,
} from "./session-detail-state";
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

const DEBOUNCE_MS = 900;

type Props = {
  initialDetail: SessionDetail;
  sessionVersion: string | null;
  initialError: string | null;
  sessionRecoveryHref: string | null;
};

type DetailResponse = {
  detail?: SessionDetail;
  message?: string;
  session_version?: string;
};

export function SessionWorkbench({
  initialDetail,
  sessionVersion,
  initialError,
  sessionRecoveryHref,
}: Props) {
  const [state, setState] = useState<DetailState>(() =>
    initialDetailState(initialDetail),
  );
  const [binding, setBinding] = useState(sessionVersion);
  const [busy, setBusy] = useState<"reload" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState(initialError ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef<string | null>(null);
  const deleteKeyRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const detail = state.detail;
  const scope = sessionScopeView({
    contextLabel: detail.context_label,
    personId: detail.person_id,
    personLabel: detail.person_label,
    relationshipContextId: detail.relationship_context_id,
    scopeKind: detail.scope_kind,
    sessionId: detail.session_id,
  });

  const persist = useCallback(
    async (force = false) => {
      const current = stateRef.current;
      if (!binding) return;
      const request = buildSaveRequest(current, keyRef.current ?? "");
      if (!request) {
        if (force && current.detail.state === "active") {
          keyRef.current = null;
        }
        return;
      }
      setState((previous) => markSaving(previous));
      try {
        const response = await workspaceSessionFetch(
          `/api/workspace-sessions/${encodeURIComponent(current.detail.session_id)}`,
          {
            body: JSON.stringify(request),
            cache: "no-store",
            headers: {
              "content-type": "application/json",
              "x-workspace-session": binding,
            },
            keepalive: true,
            method: "PUT",
          },
        );
        const payload = (await response.json()) as DetailResponse;
        if (payload.session_version) setBinding(payload.session_version);
        if (isDetailConflictResponse(response.status)) {
          keyRef.current = null;
          setState((previous) => markConflict(previous));
          return;
        }
        if (isDetailGoneResponse(response.status)) {
          keyRef.current = null;
          setNotice(payload.message || "这段对话已删除或过期。");
          try {
            const readback = await readSession(current.detail.session_id, binding);
            if (readback) setState((previous) => markDeleted(previous, readback));
          } catch {
            setState((previous) => markSaveError(previous, payload.message || "内容不可用。"));
          }
          return;
        }
        if (!response.ok || !payload.detail) {
          throw new Error(payload.message || "保存失败。");
        }
        if (payload.detail.state !== "active") {
          setState((previous) => markDeleted(previous, payload.detail as SessionDetail));
          return;
        }
        keyRef.current = null;
        setState((previous) => {
          const next = markSaved(
            previous,
            payload.detail as SessionDetail,
            request.composer_draft,
          );
          if (next.status === "pending") keyRef.current = crypto.randomUUID();
          return next;
        });
      } catch (caught) {
        setState((previous) =>
          markSaveError(
            previous,
            caught instanceof Error ? caught.message : "保存失败，草稿仍在本机。",
          ),
        );
      }
    },
    [binding],
  );

  // Debounced persistence. Lifecycle flush keeps a committed draft from being
  // lost when the tab is backgrounded or removed.
  useEffect(() => {
    if (state.status !== "pending") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist();
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.draft, state.status, persist]);

  useEffect(() => {
    function flush() {
      const current = stateRef.current;
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
    return () => window.removeEventListener("pagehide", flush);
  }, [persist]);

  async function reload() {
    if (!binding) return;
    setBusy("reload");
    setNotice("");
    try {
      const readback = await readSession(detail.session_id, binding);
      if (readback) {
        setState((previous) => {
          const next = applyReload(previous, readback);
          keyRef.current =
            next.status === "pending" ? crypto.randomUUID() : null;
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
    if (!binding) return;
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
            "x-workspace-session": binding,
          },
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as DetailResponse;
      if (payload.session_version) setBinding(payload.session_version);
      if (isDetailConflictResponse(response.status)) {
        setConfirmingDelete(false);
        deleteKeyRef.current = null;
        setState((previous) => markConflict(previous));
        return;
      }
      if (!response.ok || !payload.detail) {
        throw new Error(payload.message || "删除失败。");
      }
      setConfirmingDelete(false);
      deleteKeyRef.current = null;
      setState((previous) => markDeleted(previous, payload.detail as SessionDetail));
      setNotice(deletedNotice());
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "删除失败。");
    } finally {
      setBusy(null);
    }
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
    <section aria-labelledby="session-title" className={styles.page}>
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
            这条对话是历史记录，属于展示内容（{detail.display_authority}）。它不代表已核实的事实，也不授予任何执行权限。
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
                disabled={!canDeleteSession(state)}
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

      <section aria-label="草稿" className={styles.composer}>
        <label className={styles.composerLabel} htmlFor="session-composer-draft">
          草稿
        </label>
        <p className={styles.hint}>
          草稿放在这里是为了下次能接着写。它会自动保存在这条对话上，不会发送，也不会触发模型或对外操作。
        </p>
        <textarea
          aria-describedby="session-draft-status"
          className={styles.textarea}
          disabled={detail.state !== "active"}
          id="session-composer-draft"
          maxLength={12_000}
          onChange={(event) =>
            setState((previous) => {
              if (!keyRef.current) keyRef.current = crypto.randomUUID();
              return applyDraftInput(previous, event.target.value);
            })
          }
          placeholder={detail.state === "active" ? "写下你想保留的内容…" : "对话不可用，无法编辑草稿。"}
          rows={6}
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
            <button
              className={styles.secondary}
              disabled={detail.state !== "active" || state.status === "saving"}
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
