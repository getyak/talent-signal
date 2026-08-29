import type {
  RelationshipAgentHistory,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import { describe, expect, it } from "vitest";

import { relationshipNextMoveDecision } from "@/components/relationship-workspace/relationship-next-move";
import { buildRelationshipOutcomeTimeline } from "@/components/relationship-workspace/relationship-outcome-timeline";
import {
  isCompleteCalendarDate,
  requiresFactSupersession,
} from "@/components/relationship-workspace/relationship-fact-review";
import { governedCaptureDeletionReceipt } from "@/components/relationship-workspace/governed-capture-deletion";
import {
  relationshipWorkspaceReadbackBoundaryError,
  requestRelationshipWorkspaceMutation,
} from "@/components/relationship-workspace/relationship-workspace-command";
import { relationshipEvidenceProjectionState } from "@/components/relationship-workspace/relationship-evidence-projection";
import { relationshipCurrentDependency } from "@/components/relationship-workspace/relationship-contact-header";
import { relationshipBriefContinuityReceipt } from "@/components/relationship-workspace/relationship-history";
import {
  relationshipIntegrationFetch,
  relationshipIntegrationSessionExpired,
  workspaceSessionExpired,
} from "@/components/workspace-session-request";
import {
  relationshipAgentConversationKey,
  relationshipAgentDraftStorageKey,
  relationshipAgentResponseIsCurrent,
  relationshipAgentScopeKey,
} from "@/components/relationship-workspace/use-relationship-agent-controller";
import {
  relationshipAgentHistoryMatchesScope,
  relationshipHistoryScopeKey,
  relationshipReadbackRequestIsCurrent,
  relationshipReadbackSessionExpired,
} from "@/components/relationship-workspace/use-relationship-workspace-readback";

function workspaceFixture({
  confirmed = false,
  effect = null,
  staleApproval = false,
}: {
  confirmed?: boolean;
  effect?: WorkspaceReviewResponse["latest_effect"];
  staleApproval?: boolean;
} = {}) {
  return {
    analysis: {
      action: {
        id: "action-1",
        required_assertion_ids: ["assertion-1"],
        status: "proposed",
      },
      assertions: [
        {
          id: "assertion-1",
          review_status: confirmed ? "confirmed" : "pending",
        },
      ],
      created_at: "2026-08-26T09:00:00.000Z",
    },
    capture: {
      created_at: "2026-08-26T08:00:00.000Z",
      messages: [{ id: "message-1" }],
    },
    confirmed_state: {
      assertions: [
        {
          evidence_id: "message-1",
          field: "current_status",
          id: "state-1",
          state_status: "active",
          value: "Considering the role",
        },
      ],
    },
    latest_approval: staleApproval
      ? {
          action_version: 2,
          granted_at: "2026-08-26T10:00:00.000Z",
          id: "approval-1",
          status: "stale",
        }
      : null,
    latest_effect: effect,
    source_authorization: { state: "authorized" },
  } as unknown as WorkspaceReviewResponse;
}

describe("relationship governed projection", () => {
  it("scopes Agent draft recovery to the canonical account and relationship", () => {
    const scope = {
      person: { id: "person-1", display_label: "Alex" },
      relationship_context: { id: "context-1", display_label: "Search" },
    };
    expect(relationshipAgentScopeKey({ accountId: null, scope })).toBeNull();
    const key = relationshipAgentScopeKey({ accountId: "account-1", scope });
    expect(key).toBe("account-1:person-1:context-1");
    expect(relationshipAgentDraftStorageKey(key!)).toBe(
      "talent-signal:relationship-agent-draft:v1:account-1:person-1:context-1",
    );
    expect(
      relationshipAgentConversationKey({ accountId: "account-1", scope }),
    ).toBe("account-1:person-1:context-1");
    expect(
      relationshipAgentConversationKey({ accountId: null, scope }),
    ).toBe("volatile:person-1:context-1");
    expect(
      relationshipAgentConversationKey({ accountId: null, scope: null }),
    ).toBe("unscoped");
  });

  it("rejects an Agent response after cancellation or a relationship switch", () => {
    expect(
      relationshipAgentResponseIsCurrent({
        aborted: false,
        activeKey: "scope-a",
        requestKey: "scope-a",
      }),
    ).toBe(true);
    expect(
      relationshipAgentResponseIsCurrent({
        aborted: true,
        activeKey: "scope-a",
        requestKey: "scope-a",
      }),
    ).toBe(false);
    expect(
      relationshipAgentResponseIsCurrent({
        aborted: false,
        activeKey: "scope-b",
        requestKey: "scope-a",
      }),
    ).toBe(false);
  });

  it("accepts durable history only for the relationship that requested it", () => {
    const history = {
      person_id: "person-1",
      relationship_context_id: "context-1",
    } as RelationshipAgentHistory;

    expect(relationshipHistoryScopeKey("person-1", "context-1")).toBe(
      "person-1:context-1",
    );
    expect(
      relationshipAgentHistoryMatchesScope(
        history,
        "person-1",
        "context-1",
      ),
    ).toBe(true);
    expect(
      relationshipAgentHistoryMatchesScope(
        history,
        "person-2",
        "context-1",
      ),
    ).toBe(false);
    expect(
      relationshipReadbackRequestIsCurrent({
        aborted: false,
        activeKey: "person-2:context-2",
        requestKey: "person-1:context-1",
      }),
    ).toBe(false);
    expect(
      relationshipReadbackSessionExpired(401, {
        code: "backend_session_expired",
      }),
    ).toBe(true);
    expect(
      relationshipReadbackSessionExpired(503, {
        code: "backend_session_expired",
      }),
    ).toBe(false);
  });

  it("keeps active and historical facts distinct in the evidence projection", () => {
    const workspace = workspaceFixture();
    workspace.confirmed_state.assertions.push({
      evidence_id: "message-1",
      field: "current_status",
      id: "state-2",
      state_status: "superseded",
      value: "Earlier status",
    } as WorkspaceReviewResponse["confirmed_state"]["assertions"][number]);
    const projection = relationshipEvidenceProjectionState(workspace);
    expect(projection.active.map((state) => state.id)).toEqual(["state-1"]);
    expect(projection.historical.map((state) => state.id)).toEqual([
      "state-2",
    ]);
    expect(projection.sourceAuthorizationAvailable).toBe(true);
  });

  it("derives relationship attention without rating the person", () => {
    const pending = workspaceFixture();
    expect(relationshipCurrentDependency(pending)).toBe(
      "证据需要审阅",
    );

    const confirmed = workspaceFixture({ confirmed: true });
    expect(relationshipCurrentDependency(confirmed)).toBe(
      "关系背景为最新状态",
    );

    const verifiedEffect = workspaceFixture({
      confirmed: true,
      effect: {
        outcome: { status: "verified" },
      } as WorkspaceReviewResponse["latest_effect"],
    });
    expect(relationshipCurrentDependency(verifiedEffect)).toBe(
      "下一步已记录",
    );

    confirmed.source_authorization.state = "revoked";
    expect(relationshipCurrentDependency(confirmed)).toBe(
      "来源访问状态：revoked",
    );
  });

  it("recovers only a scoped brief receipt, never a stale answer body", () => {
    const history = {
      operations: [
        {
          detail: "answer · 3 Wiki blocks pinned to an immutable snapshot.",
          kind: "chat_brief",
          occurred_at: "2026-08-26T10:00:00.000Z",
          references: { knowledge_snapshot_id: "snapshot-1" },
          status: "completed",
        },
      ],
    } as RelationshipAgentHistory;

    expect(relationshipBriefContinuityReceipt(history)).toEqual({
      detail: "answer · 3 Wiki blocks pinned to an immutable snapshot.",
      occurredAt: "2026-08-26T10:00:00.000Z",
      snapshotId: "snapshot-1",
      stale: false,
    });
    history.operations[0]!.status = "superseded";
    expect(relationshipBriefContinuityReceipt(history)?.stale).toBe(true);
    expect(relationshipBriefContinuityReceipt(null)).toBeNull();
  });

  it("replaces readable state only after a verified workspace mutation readback", async () => {
    const verifiedWorkspace = workspaceFixture();
    const verified = await requestRelationshipWorkspaceMutation(
      "/mutation",
      { method: "POST" },
      (async () =>
        new Response(JSON.stringify({ workspace: verifiedWorkspace }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })) as typeof fetch,
    );
    expect(verified).toEqual({ ok: true, workspace: verifiedWorkspace });

    const missingReadback = await requestRelationshipWorkspaceMutation(
      "/mutation",
      { method: "POST" },
      (async () =>
        new Response(JSON.stringify({ status: "accepted" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })) as typeof fetch,
    );
    expect(missingReadback).toEqual({
      message: "更新没有返回已核验的工作台读取结果。",
      ok: false,
    });
  });

  it("rejects mutation readbacks outside the canonical account and capture", async () => {
    const workspace = workspaceFixture();
    workspace.account_id = "account-2";
    workspace.capture.id = "capture-2";
    const request = (async () =>
      new Response(JSON.stringify({ workspace }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })) as typeof fetch;

    expect(
      await requestRelationshipWorkspaceMutation(
        "/mutation",
        { method: "POST" },
        request,
        { expectedAccountId: "account-1" },
      ),
    ).toEqual({
      message:
        "更新返回了其他账号的工作台。先前已核验状态保持可见。",
      ok: false,
    });
    workspace.account_id = "account-1";
    expect(
      relationshipWorkspaceReadbackBoundaryError(workspace, {
        expectedAccountId: "account-1",
        expectedCaptureId: "capture-1",
      }),
    ).toBe(
      "更新返回的采集内容与当前审阅不同。先前已核验状态保持可见。",
    );
  });

  it("surfaces a canonical mutation error without inventing next state", async () => {
    const result = await requestRelationshipWorkspaceMutation(
      "/mutation",
      { method: "POST" },
      (async () =>
        new Response(JSON.stringify({ message: "Version is stale." }), {
          headers: { "Content-Type": "application/json" },
          status: 409,
        })) as typeof fetch,
    );
    expect(result).toEqual({ message: "Version is stale.", ok: false });
  });

  it("preserves an expired-session code for a recoverable client path", async () => {
    const result = await requestRelationshipWorkspaceMutation(
      "/mutation",
      { method: "POST" },
      (async () =>
        new Response(
          JSON.stringify({
            code: "backend_session_expired",
            message: "Sign in again.",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 401,
          },
        )) as typeof fetch,
    );
    expect(result).toEqual({
      code: "backend_session_expired",
      message: "Sign in again.",
      ok: false,
    });
  });

  it("detects expired local-integration responses without consuming them", async () => {
    expect(
      relationshipIntegrationSessionExpired(401, {
        code: "backend_session_expired",
      }),
    ).toBe(true);
    expect(
      relationshipIntegrationSessionExpired(401, {
        code: "authentication_required",
      }),
    ).toBe(false);
    expect(
      workspaceSessionExpired(401, {
        error: { code: "backend_session_expired" },
      }),
    ).toBe(true);
    expect(
      workspaceSessionExpired(401, {
        error: { code: "authentication_required" },
      }),
    ).toBe(false);

    const response = await relationshipIntegrationFetch(
      "/local-read",
      { cache: "no-store" },
      (async () =>
        new Response(
          JSON.stringify({ code: "backend_session_expired" }),
          {
            headers: { "Content-Type": "application/json" },
            status: 401,
          },
        )) as typeof fetch,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: "backend_session_expired",
    });
  });

  it("requires both canonical deletion and lineage receipts before clearing the page", () => {
    expect(
      governedCaptureDeletionReceipt({
        deletion: { derivatives_deleted: 4 },
      }),
    ).toBeNull();
    expect(
      governedCaptureDeletionReceipt({
        deletion: { derivatives_deleted: 4 },
        lineage: { lineage: ["capture", "assertion"] },
      }),
    ).toEqual({ derivatives: 4, lineage: 2 });
  });

  it("accepts only real complete calendar dates for corrected deadlines", () => {
    expect(isCompleteCalendarDate("2026-08-26")).toBe(true);
    expect(isCompleteCalendarDate("2026-02-29")).toBe(false);
    expect(isCompleteCalendarDate("Aug 26")).toBe(false);
  });

  it("keeps a different active fact until a source-linked supersession exists", () => {
    const proposal = {
      currentValue: "Exploring",
      pending: true,
      proposedValue: "Interviewing",
      temporalRelation: null,
    };
    expect(requiresFactSupersession(proposal)).toBe(true);
    expect(
      requiresFactSupersession({
        ...proposal,
        temporalRelation: "supersedes",
      }),
    ).toBe(false);
    expect(
      requiresFactSupersession({ ...proposal, pending: false }),
    ).toBe(false);
  });

  it("keeps an internal action gated until every required fact is confirmed", () => {
    expect(relationshipNextMoveDecision(workspaceFixture())).toEqual({
      canApproveCurrentAction: false,
      requiredFactsConfirmed: false,
      staleApprovalNeedsReview: false,
    });

    expect(
      relationshipNextMoveDecision(workspaceFixture({ confirmed: true })),
    ).toEqual({
      canApproveCurrentAction: true,
      requiredFactsConfirmed: true,
      staleApprovalNeedsReview: false,
    });
  });

  it("requires a fresh decision for a stale approval and closes approval after an effect exists", () => {
    expect(
      relationshipNextMoveDecision(
        workspaceFixture({ confirmed: true, staleApproval: true }),
      ),
    ).toEqual({
      canApproveCurrentAction: true,
      requiredFactsConfirmed: true,
      staleApprovalNeedsReview: true,
    });

    expect(
      relationshipNextMoveDecision(
        workspaceFixture({
          confirmed: true,
          effect: { attempt_id: "effect-1" } as WorkspaceReviewResponse["latest_effect"],
          staleApproval: true,
        }),
      ).canApproveCurrentAction,
    ).toBe(false);
  });

  it("orders source, confirmed state, approval, effect, and reversal by observed time", () => {
    const workspace = workspaceFixture({ confirmed: true });
    workspace.latest_approval = {
      action_version: 1,
      granted_at: "2026-08-26T10:00:00.000Z",
      id: "approval-1",
      status: "active",
    } as WorkspaceReviewResponse["latest_approval"];
    workspace.latest_effect = {
      attempt_id: "effect-1",
      outcome: {
        created_at: "2026-08-26T11:00:00.000Z",
        id: "effect-outcome-1",
        status: "verified",
        summary: "Today item is present.",
      },
      reversal: {
        latest_attempt: {
          outcome: {
            created_at: "2026-08-26T12:00:00.000Z",
            id: "reversal-outcome-1",
            status: "verified",
            summary: "Today item is absent.",
          },
        },
      },
    } as WorkspaceReviewResponse["latest_effect"];

    expect(
      buildRelationshipOutcomeTimeline(workspace).map((item) => item.id),
    ).toEqual([
      "reversal-outcome-1",
      "effect-outcome-1",
      "approval-1",
      "state-1",
      "capture",
    ]);
  });
});
