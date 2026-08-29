import type { WorkspaceReviewResponse } from "@talent-signal/contracts";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

type WorkspaceMutationEnvelope = {
  code?: string;
  message?: string;
  workspace?: WorkspaceReviewResponse;
};

export type RelationshipWorkspaceMutationResult =
  | { ok: true; workspace: WorkspaceReviewResponse }
  | { code?: string; message: string; ok: false };

export type RelationshipWorkspaceReadbackBoundary = {
  expectedAccountId?: string | null;
  expectedCaptureId?: string | null;
};

function isWorkspaceReviewResponse(
  value: WorkspaceMutationEnvelope | WorkspaceReviewResponse,
): value is WorkspaceReviewResponse {
  return "capture" in value && "analysis" in value;
}

export function relationshipWorkspaceReadbackBoundaryError(
  workspace: WorkspaceReviewResponse,
  boundary: RelationshipWorkspaceReadbackBoundary,
): string | null {
  if (
    boundary.expectedAccountId &&
    workspace.account_id !== boundary.expectedAccountId
  ) {
    return "更新返回了其他账号的工作台。先前已核验状态保持可见。";
  }
  if (
    boundary.expectedCaptureId &&
    workspace.capture.id !== boundary.expectedCaptureId
  ) {
    return "更新返回的采集内容与当前审阅不同。先前已核验状态保持可见。";
  }
  return null;
}

export async function requestRelationshipWorkspaceMutation(
  path: string,
  options: RequestInit,
  request: typeof fetch = fetch,
  boundary: RelationshipWorkspaceReadbackBoundary = {},
): Promise<RelationshipWorkspaceMutationResult> {
  try {
    const response = await relationshipIntegrationFetch(path, {
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    }, request);
    const payload = (await response.json()) as
      | WorkspaceMutationEnvelope
      | WorkspaceReviewResponse;
    if (!response.ok) {
      return {
        ...("code" in payload && payload.code
          ? { code: payload.code }
          : {}),
        message:
          "message" in payload && payload.message
            ? payload.message
            : "无法更新规范状态。",
        ok: false,
      };
    }
    const workspace =
      "workspace" in payload && payload.workspace
        ? payload.workspace
        : isWorkspaceReviewResponse(payload)
          ? payload
          : null;
    if (!workspace || !isWorkspaceReviewResponse(workspace)) {
      return {
        message: "更新没有返回已核验的工作台读取结果。",
        ok: false,
      };
    }
    const boundaryError = relationshipWorkspaceReadbackBoundaryError(
      workspace,
      boundary,
    );
    if (boundaryError) {
      return { message: boundaryError, ok: false };
    }
    return { ok: true, workspace };
  } catch (caught) {
    return {
      message:
        caught instanceof Error
          ? caught.message
          : "无法更新规范状态。",
      ok: false,
    };
  }
}
