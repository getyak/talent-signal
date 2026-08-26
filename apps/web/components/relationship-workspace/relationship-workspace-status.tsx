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
            <strong>Sign in to continue this relationship.</strong>
            <p>
              {hasVerifiedState
                ? "The last verified relationship remains visible. New reads and governed writes are paused until the account session is restored."
                : "No relationship state was substituted. Restore the account session to read this workspace again."}
            </p>
          </div>
          <Link href={sessionRecoveryHref}>Sign in again</Link>
        </div>
      ) : error ? (
        <div className="context-page-alert" role="alert">
          <Warning aria-hidden="true" size={21} weight="duotone" />
          <div>
            <strong>The workspace did not claim a new state.</strong>
            <p>{error}</p>
          </div>
          <button
            aria-label="Dismiss error"
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
          {busy}. Prior readable state stays visible.
        </div>
      ) : null}
    </>
  );
}
