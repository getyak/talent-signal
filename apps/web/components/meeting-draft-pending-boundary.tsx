"use client";

import { useEffect } from "react";

import { purgeUnavailableMeetingDraftIntents } from "@/lib/meeting-draft-pending";

export function MeetingDraftPendingBoundary({
  activeDraftIds,
  sessionVersion,
}: {
  activeDraftIds: string[];
  sessionVersion: string;
}) {
  const identity = activeDraftIds.join(",");
  useEffect(() => {
    purgeUnavailableMeetingDraftIntents(
      sessionVersion,
      new Set(identity ? identity.split(",") : []),
    );
  }, [identity, sessionVersion]);
  return null;
}
