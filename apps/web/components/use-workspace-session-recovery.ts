"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { backendSessionRecoveryHref } from "@/lib/backend-session";
import { WORKSPACE_SESSION_EXPIRED_EVENT } from "./workspace-session-request";

export function reconcileWorkspaceSessionRecoveryHref(input: {
  currentHref: string | null;
  nextInitialHref: string | null;
  previousInitialHref: string | null;
}): string | null {
  return input.previousInitialHref === input.nextInitialHref
    ? input.currentHref
    : input.nextInitialHref;
}

export function useWorkspaceSessionRecovery(
  initialRecoveryHref: string | null,
) {
  const [sessionRecoveryHref, setSessionRecoveryHref] = useState(
    initialRecoveryHref,
  );
  const previousInitialRecoveryHref = useRef(initialRecoveryHref);
  const beginSessionRecovery = useCallback(() => {
    const callbackUrl =
      typeof window === "undefined"
        ? "/workspace?surface=desk"
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setSessionRecoveryHref(backendSessionRecoveryHref(callbackUrl));
  }, []);

  useEffect(() => {
    window.addEventListener(
      WORKSPACE_SESSION_EXPIRED_EVENT,
      beginSessionRecovery,
    );
    return () =>
      window.removeEventListener(
        WORKSPACE_SESSION_EXPIRED_EVENT,
        beginSessionRecovery,
      );
  }, [beginSessionRecovery]);

  useEffect(() => {
    const previousInitialHref = previousInitialRecoveryHref.current;
    previousInitialRecoveryHref.current = initialRecoveryHref;
    setSessionRecoveryHref((currentHref) =>
      reconcileWorkspaceSessionRecoveryHref({
        currentHref,
        nextInitialHref: initialRecoveryHref,
        previousInitialHref,
      }),
    );
  }, [initialRecoveryHref]);

  return { beginSessionRecovery, sessionRecoveryHref };
}
