"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { invalidateWorkspaceDirectory, workspaceDirectoryScopeTransition } from "@/lib/workspace-directory-cache";

/**
 * Parent-mountable lifecycle boundary for the workspace directory cache.
 *
 * Ownership: the task that owns `app/workspace/layout.tsx` renders this once,
 * for example:
 *
 *   <WorkspaceDirectoryScope binding={pendingBinding}>
 *     ...existing shell...
 *   </WorkspaceDirectoryScope>
 *
 * It ties the in-memory People/Session snapshot to the credential binding that
 * is actually rendered:
 *
 * - `binding -> null` (logout, unconfirmed test workspace, expired session)
 *   discards every retained binding and aborts in-flight reads;
 * - `binding A -> binding B` discards A only;
 * - unmounting the boundary discards everything.
 *
 * Discards use the `"discard"` mode, so a still-mounted reader fails closed
 * instead of re-reading with the old credential. Nothing here revives an
 * invalidated load.
 */
export function WorkspaceDirectoryScope({
  binding,
  children,
}: {
  binding: string | null | undefined;
  children?: ReactNode;
}) {
  const previous = useRef<string | null | undefined>(binding);

  useEffect(() => {
    const transition = workspaceDirectoryScopeTransition(previous.current, binding);
    previous.current = binding;
    if (transition.kind === "none") return;
    if (transition.kind === "discard-all") {
      // Identity is gone or unconfirmed: no cached binding may survive.
      invalidateWorkspaceDirectory(undefined, "discard");
      return;
    }
    // Identity changed: the previous binding can never be read again.
    invalidateWorkspaceDirectory(transition.previous, "discard");
  }, [binding]);

  useEffect(
    () => () => {
      // Leaving the workspace (or a dev StrictMode remount) drops every
      // retained snapshot; revoked credentials cannot outlive the shell.
      invalidateWorkspaceDirectory(undefined, "discard");
    },
    [],
  );

  return children ?? null;
}
