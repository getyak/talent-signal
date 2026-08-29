"use client";

import { CircleNotch, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";

export function RelationshipWorkspaceStatus({
  busy,
  error,
  hasVerifiedState,
  onDismissError,
  sessionRecoveryHref,
}: {
  busy: string;
  error: string;
  hasVerifiedState: boolean;
  onDismissError: () => void;
  sessionRecoveryHref: string | null;
}) {
  return (
    <>
      {sessionRecoveryHref ? (
        <div
          className="context-page-alert context-page-alert--session"
          role="alert"
        >
          <Warning aria-hidden="true" size={21} weight="duotone" />
          <div>
            <strong>登录后继续处理这段关系。</strong>
            <p>
              {hasVerifiedState
                ? "上一次核验的关系仍保持可见。在账号会话恢复前，新的读取与受治理写入都会暂停。"
                : "系统没有替换任何关系状态。请恢复账号会话后再次读取工作台。"}
            </p>
          </div>
          <Link href={sessionRecoveryHref}>重新登录</Link>
        </div>
      ) : error ? (
        <div className="context-page-alert" role="alert">
          <Warning aria-hidden="true" size={21} weight="duotone" />
          <div>
            <strong>工作台没有声称任何新状态。</strong>
            <p>{error}</p>
          </div>
          <button
            aria-label="关闭错误提示"
            className="context-icon-button"
            onClick={onDismissError}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      ) : null}

      {busy && !sessionRecoveryHref ? (
        <div className="context-busy" role="status">
          <CircleNotch aria-hidden="true" className="spin" size={18} />
          {busy}。先前可读取的状态保持可见。
        </div>
      ) : null}
    </>
  );
}
