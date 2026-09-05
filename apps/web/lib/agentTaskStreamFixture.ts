import type {
  AgentTaskEvent,
  AgentTaskProjection,
} from "@talent-signal/contracts";

export const STREAM_PREVIEW_IDS = {
  artifact: "10000000-0000-4000-8000-000000000001",
  bundle: "10000000-0000-4000-8000-000000000002",
  capture: "10000000-0000-4000-8000-000000000003",
  claim: "10000000-0000-4000-8000-000000000004",
  evidence: "10000000-0000-4000-8000-000000000005",
  person: "10000000-0000-4000-8000-000000000006",
  proposal: "10000000-0000-4000-8000-000000000007",
  pursuit: "10000000-0000-4000-8000-000000000008",
  run: "10000000-0000-4000-8000-000000000009",
  task: "10000000-0000-4000-8000-000000000010",
  user: "10000000-0000-4000-8000-000000000011",
  workspace: "10000000-0000-4000-8000-000000000012",
} as const;

const DIGEST = "a".repeat(64);
const NOW = "2026-09-06T02:00:00.000Z";

export function agentTaskStreamPreviewTask(
  status: AgentTaskProjection["status"] = "active",
): AgentTaskProjection {
  const complete = status !== "active";
  return {
    id: STREAM_PREVIEW_IDS.task,
    workspace_id: STREAM_PREVIEW_IDS.workspace,
    pursuit_id: STREAM_PREVIEW_IDS.pursuit,
    requested_by_user_id: STREAM_PREVIEW_IDS.user,
    kind: "pre_call_briefing",
    objective: "准备下一次客户同步前的关系简报。",
    task_revision: complete ? 2 : 1,
    status,
    permission_ceiling: [
      "read_pursuit",
      "read_evidence",
      "create_briefing_artifact",
      "stage_pursuit_proposal",
      "record_no_action",
    ],
    semantic_snapshot: {
      pursuit_revision: 7,
      evidence_manifest_digest: DIGEST,
      agent_definition_digest: DIGEST,
      tool_schema_digest: DIGEST,
      policy_digest: DIGEST,
      model_digest: DIGEST,
      created_at: NOW,
    },
    latest_run: complete
      ? {
          id: STREAM_PREVIEW_IDS.run,
          attempt: 1,
          status: "suspended",
          agent_run_status: "proposal_staged",
          reason_code: "PROPOSAL_STAGED",
          proposal_id: STREAM_PREVIEW_IDS.proposal,
          no_action_id: null,
        }
      : {
          id: null,
          attempt: 1,
          status: "running",
          agent_run_status: null,
          reason_code: null,
          proposal_id: null,
          no_action_id: null,
        },
    artifact: complete
      ? {
          id: STREAM_PREVIEW_IDS.artifact,
          task_id: STREAM_PREVIEW_IDS.task,
          run_id: STREAM_PREVIEW_IDS.run,
          type: "pursuit_briefing",
          authority: "non_canonical",
          status: "current",
          title: "Briefing · CFO succession search",
          summary: "客户已确认本周先校准薪酬边界，再决定是否安排下一轮会面。",
          what_changed: [
            {
              id: STREAM_PREVIEW_IDS.claim,
              statement: "最新通话记录明确写下：周四前由客户补充长期激励范围。",
              epistemic_status: "observed_evidence",
              authority: "reviewed_evidence",
              evidence_refs: [STREAM_PREVIEW_IDS.evidence],
              observed_at: NOW,
              freshness: "current",
            },
          ],
          what_matters_now: {
            dependency: "客户需要先确认长期激励范围。",
            reason: "候选人的下一轮沟通依赖这个边界；现有证据不支持提前承诺。",
            authority: "agent_interpretation",
            evidence_refs: [STREAM_PREVIEW_IDS.evidence],
          },
          next_move: {
            kind: "review_proposal",
            label: "审阅一条客户跟进提案",
            reason: "提案只准备问题，不会自动发送消息或安排会议。",
          },
          limitations: [
            "简报是非规范产物，不能确认事实或执行动作。",
            "只读取冻结清单中的一条已审阅来源。",
          ],
          evidence_manifest_digest: DIGEST,
          observed_at: NOW,
          expires_at: "2026-09-07T02:00:00.000Z",
        }
      : null,
    clarification: null,
    decision_bundle: complete
      ? {
          id: STREAM_PREVIEW_IDS.bundle,
          task_id: STREAM_PREVIEW_IDS.task,
          task_revision: 2,
          bundle_revision: 1,
          dependency: "是否将客户的薪酬澄清问题加入当前寻访？",
          status: "open",
          proposal_id: STREAM_PREVIEW_IDS.proposal,
          items: [
            {
              id: STREAM_PREVIEW_IDS.person,
              domain_subject_kind: "pursuit_proposal_item",
              domain_subject_id: STREAM_PREVIEW_IDS.proposal,
              item_revision: 1,
              status: "open",
              domain_receipt_ref: null,
            },
          ],
          expires_at: "2026-09-13T02:00:00.000Z",
        }
      : null,
    latest_sequence: complete ? 7 : 1,
    latest_cursor: complete ? "7" : "1",
    continue_allowed: false,
    external_effects: [],
    created_at: NOW,
    updated_at: NOW,
    completed_at: null,
  };
}

export function agentTaskStreamPreviewEvents(): AgentTaskEvent[] {
  const names: Array<[AgentTaskEvent["name"], Record<string, unknown>]> = [
    ["task.accepted", { evidence_reference_count: 1 }],
    ["run.started", { attempt: 1 }],
    ["context.compiled", { pursuit_revision: 7 }],
    ["checkpoint.saved", { checkpoint_sequence: 1 }],
    ["artifact.ready", { artifact_id: STREAM_PREVIEW_IDS.artifact }],
    ["decision.requested", { bundle_id: STREAM_PREVIEW_IDS.bundle }],
    ["run.completed", { status: "waiting_for_domain_decision" }],
  ];
  return names.map(([name, public_payload], index) => ({
    event_id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    workspace_id: STREAM_PREVIEW_IDS.workspace,
    task_id: STREAM_PREVIEW_IDS.task,
    run_id: index === 0 ? null : STREAM_PREVIEW_IDS.run,
    task_sequence: index + 1,
    stream_cursor: String(index + 1),
    name,
    occurred_at: new Date(Date.parse(NOW) + index * 600).toISOString(),
    schema_version: 1,
    public_payload,
  }));
}
