"use client";

import { CircleNotch, Warning, X } from "@phosphor-icons/react";
import Link from "next/link";

export function RelationshipWorkspaceStatus({
  busy,
  error,
  onDismissError,
  sessionRecoveryHref,
}: {
  busy: string;
  error: string;
  onDismissError: () => void;
  sessionRecoveryHref: string | null;
}) {
  return (
    <>
      {error ? (
        <div className="context-page-alert" role="alert">
          <Warning aria-hidden="true" size={21} weight="duotone" />
          <div>
            <strong>The workspace did not claim a new state.</strong>
            <p>{error}</p>
          </div>
          {sessionRecoveryHref ? (
            <Link href={sessionRecoveryHref}>Sign in again</Link>
          ) : (
            <button
              aria-label="Dismiss error"
              className="context-icon-button"
              onClick={onDismissError}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      ) : null}

      {busy ? (
        <div className="context-busy" role="status">
          <CircleNotch aria-hidden="true" className="spin" size={18} />
          {busy}. Prior readable state stays visible.
        </div>
      ) : null}
    </>
  );
}
