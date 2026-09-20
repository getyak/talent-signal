"use client";

import { ArrowUp, ArrowClockwise, FileImage, Warning } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  boundedNewConversationObjective,
  createNewConversationIntent,
  isNewConversationId,
  newConversationCaptureHref,
  newConversationIntentFromPending,
  newConversationPendingDraft,
  readHomeConversationDraft,
  objectiveIsSendable,
  type NewConversationIntent,
} from "@/lib/new-conversation";
import { WORKSPACE_NEW_CONVERSATION_EVENT } from "@/lib/workspace-navigation";
import { AgentTurnThread } from "./relationship-workspace/agent-turn-thread";
import { useWorkspaceChat } from "./relationship-workspace/use-workspace-chat";
import {
  clearPendingSessionDraft,
  writePendingSessionDraft,
} from "./session-workbench/session-draft-pending";
import { workspaceSessionFetch } from "./workspace-session-request";
import styles from "./new-conversation.module.css";

// The capture editor and image processing load only when capture opens.
const CapturePanel = dynamic(() =>
  import("./relationship-workspace/screenshot-capture-panel").then(
    (module) => module.CapturePanel,
  ),
  { loading: () => <p role="status">正在打开截图导入…</p> },
);

type CreatedSession = { revision: number; updatedAt: string };

async function createCanonicalSession(
  intent: NewConversationIntent,
  binding: string,
  signal: AbortSignal,
): Promise<CreatedSession> {
  const response = await workspaceSessionFetch("/api/workspace-sessions", {
    body: JSON.stringify({
      session_id: intent.sessionId,
      updated_at: intent.updatedAt,
    }),
    cache: "no-store",
    signal,
    headers: {
      "content-type": "application/json",
      "x-workspace-session": binding,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        code?: string;
        detail?: { revision?: unknown; updated_at?: unknown };
        message?: string;
      }
    | null;
  const detail = payload?.detail;
  if (
    response.ok &&
    detail &&
    Number.isInteger(detail.revision) &&
    typeof detail.updated_at === "string"
  ) {
    return { revision: Number(detail.revision), updatedAt: detail.updated_at };
  }
  // Replaying the same create intent must resolve to the existing Session
  // instead of overwriting it or silently creating a second conversation.
  const readback = await workspaceSessionFetch(
    `/api/workspace-sessions/${encodeURIComponent(intent.sessionId)}`,
    {
      cache: "no-store",
      signal,
      headers: { "x-workspace-session": binding },
    },
  );
  const readPayload = (await readback.json().catch(() => null)) as
    | { detail?: { revision?: unknown; updated_at?: unknown } }
    | null;
  const existing = readPayload?.detail;
  if (
    readback.ok &&
    existing &&
    Number.isInteger(existing.revision) &&
    typeof existing.updated_at === "string"
  ) {
    return {
      revision: Number(existing.revision),
      updatedAt: existing.updated_at,
    };
  }
  throw new Error(payload?.message || "无法建立这条对话。");
}

/**
 * The default authenticated entry: a quiet conversation canvas over a real,
 * canonical Session.
 *
 * Sending creates the Session through the existing `/api/workspace-sessions`
 * route, persists the unsent objective as a scoped pending intent, then submits
 * through the existing governed workspace chat controller. A reload therefore
 * repeats the same Session and the same request id instead of starting over.
 */
export function WorkspaceNewConversation({
  accountId,
  sessionVersion,
  sessionBinding,
  storageScope,
}: {
  accountId: string | null;
  sessionVersion: string | null;
  sessionBinding: string | null;
  storageScope: string | null;
}) {
  const [instance, setInstance] = useState(0);

  useEffect(() => {
    const reset = () => setInstance((current) => current + 1);
    window.addEventListener(WORKSPACE_NEW_CONVERSATION_EVENT, reset);
    return () =>
      window.removeEventListener(WORKSPACE_NEW_CONVERSATION_EVENT, reset);
  }, []);

  return (
    <ConversationCanvas
      accountId={accountId}
      key={instance}
      sessionBinding={sessionBinding}
      sessionVersion={sessionVersion}
      storageScope={storageScope}
    />
  );
}

function ConversationCanvas({
  accountId,
  sessionVersion,
  sessionBinding,
  storageScope,
}: {
  accountId: string | null;
  sessionVersion: string | null;
  sessionBinding: string | null;
  storageScope: string | null;
}) {
  const router = useRouter();
  const submitLock = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    return () => { controller.abort(); };
  }, [sessionBinding]);
  const [objective, setObjective] = useState("");
  const [intent, setIntent] = useState<NewConversationIntent | null>(null);
  const [restored, setRestored] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failedObjective, setFailedObjective] = useState<string | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const enabled = Boolean(accountId && sessionVersion && sessionBinding && storageScope);
  const { ask, turns, busy } = useWorkspaceChat(
    accountId,
    sessionVersion,
    enabled,
    setError,
  );

  // Restore an unsent objective from the same account's expiring partition.
  useEffect(() => {
    const scope = storageScope;
    if (!scope) return;
    function restore(activeScope: string) {
      const pending = readHomeConversationDraft(activeScope);
      const recovered = newConversationIntentFromPending(pending);
      if (!pending || !recovered) return;
      setIntent(recovered);
      setObjective(boundedNewConversationObjective(pending.latest.draft));
      if ((pending as typeof pending & {attempted?: boolean}).attempted) setFailedObjective(pending.latest.draft);
      setRestored(true);
      setNotice("已恢复离开前尚未发送的消息。");
    }
    restore(scope);
  }, [storageScope]);

  function discardRestored() {
    if (intent && storageScope) {
      clearPendingSessionDraft(storageScope, intent.sessionId, intent.requestId);
    }
    setIntent(null);
    setObjective("");
    setRestored(false);
    setFailedObjective(null);
    setNotice("");
    setError("");
  }

  function updateObjective(value: string) {
    const bounded = boundedNewConversationObjective(value);
    setObjective(bounded);
    if (!storageScope) return;
    const next = intent ?? createNewConversationIntent();
    setIntent(next);
    if (!bounded) { clearPendingSessionDraft(storageScope, next.sessionId); return; }
    if (!writePendingSessionDraft(newConversationPendingDraft({
      intent: next, objective: bounded, storageScope, baseRevision: 1,
    }))) setNotice("本机草稿存储不可用，请保留此页面直到发送完成。");
  }

  async function submit() {
    if (submitLock.current || creating || busy) return;
    const submitted = boundedNewConversationObjective(objective).trim();
    if (!objectiveIsSendable(objective, busy) || !submitted) return;
    if (!sessionBinding || !storageScope) {
      setError("当前账号尚未就绪，请重新打开工作台。");
      return;
    }
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted) return;
    submitLock.current = true;
    try {
    const binding = sessionBinding;
    const scope = storageScope;
    setError("");
    setNotice("");
    setFailedObjective(null);
    let nextIntent = intent ?? createNewConversationIntent();
    setIntent(nextIntent);
    // Persist identity BEFORE the first request: unknown network outcomes retry the same operation.
    writePendingSessionDraft({ ...newConversationPendingDraft({
      intent: nextIntent, objective: submitted, storageScope: scope, baseRevision: 1,
    }), attempted: true } as ReturnType<typeof newConversationPendingDraft>);
    setCreating(true);
    try {
      const created = await createCanonicalSession(nextIntent, binding, controller.signal);
      if (controller.signal.aborted) return;
      nextIntent = { ...nextIntent, updatedAt: created.updatedAt };
      setIntent(nextIntent);
      setLastSessionId(nextIntent.sessionId);
      const pending = newConversationPendingDraft({
        baseRevision: created.revision,
        intent: nextIntent,
        objective: submitted,
        storageScope: scope,
      });
      if (!writePendingSessionDraft({ ...pending, attempted: true } as typeof pending)) {
        setNotice("本机草稿恢复存储不可用；请等待发送完成后再离开。");
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      setCreating(false);
      setError(
        caught instanceof Error ? caught.message : "无法建立这条对话。",
      );
      setFailedObjective(submitted);
      return;
    }
    setCreating(false);
    setRestored(false);
    const delivered = await ask(submitted, {
      requestId: nextIntent.requestId,
      sessionId: nextIntent.sessionId,
    });
    if (controller.signal.aborted) return;
    if (delivered === true) {
      clearPendingSessionDraft(scope, nextIntent.sessionId, nextIntent.requestId);
      setIntent(null);
      setObjective("");
      setNotice("已保存，正在打开对话…");
      router.push(`/workspace/sessions/${nextIntent.sessionId}`);
    } else {
      setFailedObjective(submitted);
    }
    } finally { submitLock.current = false; }
  }

  function abandonFailed() {
    if (intent && storageScope) {
      clearPendingSessionDraft(storageScope, intent.sessionId, intent.requestId);
    }
    setIntent(null);
    setObjective("");
    setFailedObjective(null);
    setError("");
    setNotice("");
  }

  const empty = turns.length === 0;
  const canRetry = failedObjective !== null && !busy && !creating;
  const sendable =
    objectiveIsSendable(objective, busy) && enabled && !creating;

  return (
    <div
      className={styles.canvas}
      data-empty={empty ? "true" : undefined}
      data-has-messages={empty ? undefined : "true"}
    >
      <div className={styles.inner}>
        {empty ? (
          <header className={styles.welcome}>
            <span aria-hidden="true" className={styles.welcomeMark} />
            <h1 className={styles.welcomeTitle}>今天想推进什么？</h1>
          </header>
        ) : (
          <AgentTurnThread
            className={styles.thread}
            turns={turns}
            userMessageClassName={styles.userMessage}
          />
        )}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="new-conversation-objective">
            给 Talent Signal 发消息
          </label>
          <textarea
            id="new-conversation-objective"
            maxLength={1_000}
            readOnly={creating || busy || failedObjective !== null}
            onChange={(event) =>
              updateObjective(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="输入消息，或粘贴一段内容…"
            rows={2}
            value={objective}
          />
          <div className={styles.composerFooter}>
            <div className={styles.composerStart}>
              <button
                aria-label="导入对话或屏幕截图"
                className={styles.attach}
                onClick={() => setCaptureOpen(true)}
                title="导入截图"
                type="button"
              >
                <FileImage aria-hidden="true" size={18} weight="duotone" />
              </button>
              <p className={styles.scopeLine}>
                {enabled ? (
                  <>
                    <span>未关联人物</span>
                    <span aria-hidden="true">·</span>
                    <Link href="/workspace/people">选择人物</Link>
                  </>
                ) : (
                  <span role="status">正在确认登录空间…</span>
                )}
              </p>
            </div>
            <div className={styles.composerActions}>
              <button
                aria-label="发送"
                className={styles.send}
                disabled={!sendable}
                type="submit"
              >
                <ArrowUp aria-hidden="true" size={17} weight="bold" />
              </button>
            </div>
          </div>
        </form>

        {restored ? (
          <p className={styles.restored} role="status">
            <span>已恢复未发送的消息。</span>
            <button onClick={discardRestored} type="button">
              放弃
            </button>
          </p>
        ) : null}

        {creating || busy ? (
          <p className={styles.status} role="status">
            {creating ? "正在建立对话…" : "正在提交这条消息…"}
          </p>
        ) : null}

        {notice && !error ? (
          <p className={styles.status} role="status">
            {notice}
            {lastSessionId ? (
              <>
                {" "}
                <Link href={`/workspace/sessions/${lastSessionId}`}>
                  打开这条对话
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        {error ? (
          <p className={styles.error} role="alert">
            <Warning aria-hidden="true" size={15} />
            <span>
              {error}
              {canRetry ? (
                <>
                  {" "}
                  <button onClick={() => void submit()} type="button">
                    <ArrowClockwise aria-hidden="true" size={12} /> 重试这条
                  </button>
                </>
              ) : null}
              {intent || objective ? (
                <>
                  {" "}
                  <button onClick={abandonFailed} type="button">
                    放弃本次重试，重新编辑
                  </button>
                </>
              ) : null}
            </span>
          </p>
        ) : null}

        {captureOpen ? (
          <CapturePanel
            onClose={() => setCaptureOpen(false)}
            onCommitted={(workspace) => {
              setCaptureOpen(false);
              if (
                isNewConversationId(workspace.subject.id) &&
                isNewConversationId(workspace.assignment.id)
              ) {
                // A committed screenshot continues on the living person page,
                // which re-reads the scoped relationship from the server.
                window.location.assign(
                  newConversationCaptureHref(
                    workspace.subject.id,
                    workspace.assignment.id,
                  ),
                );
                return;
              }
              setNotice("来源已保存；请在人物目录中继续审阅。");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
