import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WorkspaceMeetings } from "@/components/workspace-meetings";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import {
  defaultMeetingDay,
  meetingDraftLocalDay,
  validMeetingDay,
  validMeetingMonth,
} from "@/lib/meeting-calendar";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { loadMeetingDrafts } from "@/lib/server/meetingDrafts";
import { workspaceSessionsBinding } from "@/lib/server/workspaceSessions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "与对话来源绑定、无隐式外部写入的会议草稿。",
  robots: { follow: false, index: false },
  title: "日程 · Talent Signal",
};

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; draft?: string; month?: string }>;
}) {
  if (!(await auth())?.user) {
    redirect("/login?callbackUrl=%2Fworkspace%2Fmeetings");
  }
  const claims = await readBackendSessionClaims();
  if (!claims) redirect(backendSessionRecoveryHref("/workspace/meetings"));

  const requested = await searchParams;
  let projection: Awaited<ReturnType<typeof loadMeetingDrafts>> = {
    drafts: [],
    inactiveTruncated: false,
  };
  let error: string | null = null;
  try {
    projection = await loadMeetingDrafts();
  } catch (caught) {
    if (isBackendSessionExpiredError(caught)) {
      redirect(backendSessionRecoveryHref("/workspace/meetings"));
    }
    error = "账号专属后端或会议草稿契约暂时不可用。";
  }

  const { drafts, inactiveTruncated } = projection;
  const firstDay = defaultMeetingDay(drafts);
  const requestedDay = validMeetingDay(requested.day);
  const requestedDraft = drafts.find(
    (draft) =>
      draft.id === requested.draft &&
      draft.status === "needs_review" &&
      draft.content_available,
  );
  const deepLinkDay =
    !requestedDay && !validMeetingMonth(requested.month) && requestedDraft
      ? meetingDraftLocalDay(requestedDraft)
      : null;
  const month =
    requestedDay?.slice(0, 7) ??
    validMeetingMonth(requested.month) ??
    deepLinkDay?.slice(0, 7) ??
    firstDay?.slice(0, 7) ??
    new Date().toISOString().slice(0, 7);
  const day =
    requestedDay ?? deepLinkDay ??
    (firstDay?.startsWith(month) ? firstDay : `${month}-01`);
  const selectedDraftId = requestedDraft?.id ?? null;

  return (
    <WorkspaceMeetings
      day={day}
      drafts={drafts}
      error={error}
      inactiveTruncated={inactiveTruncated}
      month={month}
      selectedDraftId={selectedDraftId}
      requestedDraftUnavailable={Boolean(requested.draft && !requestedDraft)}
      sessionVersion={workspaceSessionsBinding(claims)}
      initializeEmptyToday={!requestedDay && !validMeetingMonth(requested.month) && !requested.draft && !firstDay}
    />
  );
}
