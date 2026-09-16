"use client";

import { Check, Spinner, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  clearPendingMeetingDraftDismiss,
  clearPendingMeetingDraftEdit,
  meetingDraftDismissRejectionIsAuthoritative,
  readPendingMeetingDraftDismiss,
  writePendingMeetingDraftDismiss,
} from "@/lib/meeting-draft-pending";
import { workspaceSessionFetch } from "./workspace-session-request";
import styles from "./workspace-meetings.module.css";

export function MeetingDraftDismiss({
  draftId,
  expiresAt,
  expiresLabel,
  revision,
  returnHref,
  sessionVersion,
}: {
  draftId: string;
  expiresAt: string;
  expiresLabel: string;
  revision: number;
  returnHref: string;
  sessionVersion: string;
}) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dismiss() {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    const recovered = readPendingMeetingDraftDismiss(draftId, sessionVersion);
    const idempotencyKey = requestId.current ??
      recovered?.idempotencyKey ?? crypto.randomUUID();
    requestId.current = idempotencyKey;
    if (!writePendingMeetingDraftDismiss({
      draftId,
      expectedRevision: recovered?.expectedRevision ?? revision,
      expiresAt,
      idempotencyKey,
      savedAt: new Date().toISOString(),
      sessionVersion,
      v: 1,
    })) {
      requestId.current = null;
      setBusy(false);
      setError("浏览器无法先保存这次移除意图，已停止向后端发送。");
      return;
    }
    try {
      const response = await workspaceSessionFetch(
        `/api/meeting-drafts/${encodeURIComponent(draftId)}/dismiss`,
        {
          body: JSON.stringify({
            expected_revision: recovered?.expectedRevision ?? revision,
            idempotency_key: idempotencyKey,
          }),
          headers: {
            "content-type": "application/json",
            "x-workspace-session": sessionVersion,
          },
          method: "POST",
        },
      );
      const payload = (await response.json()) as { code?: string; message?: string };
      if (!response.ok) {
        // Only an explicit business rejection is authoritative. A gateway can
        // return JSON for 408/425/429 after the write reached the backend, so
        // those outcomes retain the exact persisted operation identity.
        if (meetingDraftDismissRejectionIsAuthoritative(
          response.status,
          payload.code,
        )) {
          requestId.current = null;
          clearPendingMeetingDraftDismiss(draftId, sessionVersion);
        }
        throw new Error(payload.message || "无法撤销这份草稿。");
      }
      requestId.current = null;
      clearPendingMeetingDraftDismiss(draftId, sessionVersion);
      clearPendingMeetingDraftEdit(draftId, sessionVersion);
      setDone(true);
      router.replace(returnHref);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法撤销这份草稿。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.dismissArea}>
      <button disabled={busy || done} onClick={() => void dismiss()} type="button">
        {busy ? (
          <Spinner aria-hidden="true" className={styles.spin} size={15} />
        ) : done ? (
          <Check aria-hidden="true" size={15} />
        ) : (
          <X aria-hidden="true" size={15} />
        )}
        {busy ? "正在移除…" : done ? "已移除" : "从待核对中移除"}
      </button>
      <small>
        移除不会创建或删除日历事件；内容仍随来源对话保留至
        {expiresLabel}
        。
      </small>
      {error ? <p role="alert">{error} 本地仍显示原状态，请刷新后核对。</p> : null}
    </div>
  );
}
