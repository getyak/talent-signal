import "server-only";

import {
  MeetingDraftListResponseSchema,
  MeetingDraftResponseSchema,
  TalentSignalHttpError,
  type MeetingDraftDismissRequest,
  type MeetingDraftListResponse,
  type MeetingDraftListScope,
  type MeetingDraftRecord,
  type MeetingDraftUpdateRequest,
} from "@talent-signal/contracts";

import { matchesTypeBox } from "@/lib/typebox-validation";
import { mergeMeetingDraftScopeSnapshots } from "@/lib/meeting-calendar";
import { authenticatedBackendClient } from "./backendAuth";

async function client() {
  const backend = await authenticatedBackendClient();
  if (!backend) {
    throw new TalentSignalHttpError(
      401,
      "backend_session_expired",
      "请重新登录后查看会议草稿。",
      null,
    );
  }
  return backend;
}

function assertList(value: unknown): MeetingDraftListResponse {
  if (!matchesTypeBox(MeetingDraftListResponseSchema, value)) {
    throw new TalentSignalHttpError(
      502,
      "meeting_drafts_unavailable",
      "后端返回的会议草稿不符合约定，已停止展示。",
      null,
    );
  }
  return value as MeetingDraftListResponse;
}

async function loadMeetingDraftScope(
  backend: Awaited<ReturnType<typeof client>>,
  scope: MeetingDraftListScope,
  pageLimit: number,
): Promise<{ drafts: MeetingDraftRecord[]; truncated: boolean }> {
  const drafts: MeetingDraftRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < pageLimit; page += 1) {
    const result = assertList(await backend.listMeetingDrafts(cursor, scope));
    drafts.push(...result.drafts);
    if (result.complete) {
      cursor = undefined;
      break;
    }
    if (!result.next_cursor || result.next_cursor === cursor) {
      throw new TalentSignalHttpError(
        502,
        "meeting_drafts_pagination_invalid",
        "后端没有提供可继续核验的会议草稿游标，已停止展示不完整结果。",
        null,
      );
    }
    cursor = result.next_cursor;
  }
  if (cursor && scope === "reviewable") {
    throw new TalentSignalHttpError(
      502,
      "meeting_drafts_page_limit",
      "会议草稿超过当前可安全核验的分页上限，已停止展示不完整结果。",
      null,
    );
  }
  return { drafts, truncated: Boolean(cursor) };
}

export type MeetingDraftProjection = {
  drafts: MeetingDraftRecord[];
  inactiveTruncated: boolean;
};

export async function loadMeetingDrafts(): Promise<MeetingDraftProjection> {
  const backend = await client();
  const reviewable = await loadMeetingDraftScope(backend, "reviewable", 20);
  const inactive = await loadMeetingDraftScope(backend, "inactive", 1);
  const drafts = mergeMeetingDraftScopeSnapshots(
    reviewable.drafts,
    inactive.drafts,
  ).sort((left, right) => {
    const leftTime = Date.parse(left.starts_at ?? left.updated_at);
    const rightTime = Date.parse(right.starts_at ?? right.updated_at);
    return leftTime === rightTime
      ? left.id.localeCompare(right.id)
      : leftTime - rightTime;
  });
  return { drafts, inactiveTruncated: inactive.truncated };
}

export async function dismissMeetingDraft(
  id: string,
  request: MeetingDraftDismissRequest,
): Promise<MeetingDraftRecord> {
  const result = await (await client()).dismissMeetingDraft(id, request);
  if (!matchesTypeBox(MeetingDraftResponseSchema, result)) {
    throw new TalentSignalHttpError(
      502,
      "meeting_draft_unavailable",
      "后端没有返回可核验的会议草稿状态。",
      null,
    );
  }
  return result.draft;
}

export async function readMeetingDraft(id: string): Promise<MeetingDraftRecord> {
  const result = await (await client()).getMeetingDraft(id);
  if (!matchesTypeBox(MeetingDraftResponseSchema, result)) {
    throw new TalentSignalHttpError(
      502,
      "meeting_draft_unavailable",
      "后端没有返回可核验的会议草稿状态。",
      null,
    );
  }
  return result.draft;
}

export async function updateMeetingDraft(
  id: string,
  request: MeetingDraftUpdateRequest,
): Promise<MeetingDraftRecord> {
  const result = await (await client()).updateMeetingDraft(id, request);
  if (!matchesTypeBox(MeetingDraftResponseSchema, result)) {
    throw new TalentSignalHttpError(
      502,
      "meeting_draft_unavailable",
      "后端没有返回可核验的会议草稿状态。",
      null,
    );
  }
  return result.draft;
}
