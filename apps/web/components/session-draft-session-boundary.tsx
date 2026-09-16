"use client";

import { useEffect } from "react";

import {
  clearAllPendingSessionDrafts,
  prunePendingSessionDrafts,
} from "./session-workbench/session-draft-pending";

export function SessionDraftSessionBoundary({
  storageScope,
}: {
  storageScope: string | null;
}) {
  useEffect(() => {
    if (storageScope) prunePendingSessionDrafts(storageScope);
    else clearAllPendingSessionDrafts();
  }, [storageScope]);
  return null;
}
