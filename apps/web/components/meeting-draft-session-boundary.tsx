"use client";

import { useEffect } from "react";

import {
  clearAllPendingMeetingDraftIntents,
  clearOtherMeetingDraftBindings,
} from "@/lib/meeting-draft-pending";

export function MeetingDraftSessionBoundary({
  sessionVersion,
}: {
  sessionVersion: string | null;
}) {
  useEffect(() => {
    if (sessionVersion) clearOtherMeetingDraftBindings(sessionVersion);
    else clearAllPendingMeetingDraftIntents();
  }, [sessionVersion]);
  return null;
}
