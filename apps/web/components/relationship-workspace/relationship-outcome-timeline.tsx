"use client";

import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import { Clock } from "@phosphor-icons/react";

import { fieldLabel, formatDate } from "./relationship-display";

export type RelationshipOutcomeTimelineItem = {
  detail: string;
  id: string;
  label: string;
  state: string;
  time: string;
};

export function buildRelationshipOutcomeTimeline(
  workspace: WorkspaceReviewResponse,
) {
  const approval = workspace.latest_approval;
  const effect = workspace.latest_effect;
  const reversalAttempt = effect?.reversal?.latest_attempt;
  const items: RelationshipOutcomeTimelineItem[] = [
    {
      id: "capture",
      label: "证据已采集",
      detail: `${workspace.capture.messages.length} 条已审阅消息`,
      time: workspace.capture.created_at,
      state: "source",
    },
    ...workspace.confirmed_state.assertions.map((state) => ({
      id: state.id,
      label:
        state.state_status === "active"
          ? `${fieldLabel(state.field)}已确认`
          : `${fieldLabel(state.field)} ${state.state_status}`,
      detail: state.value,
      time: workspace.analysis.created_at,
      state: state.state_status,
    })),
  ];

  if (approval) {
    items.push({
      id: approval.id,
      label:
        approval.status === "active"
          ? "下一步已批准"
          : `批准状态：${approval.status}`,
      detail: `行动版本 ${approval.action_version}`,
      time: approval.granted_at,
      state: "approval",
    });
  }

  if (effect?.outcome) {
    items.push({
      id: effect.outcome.id,
      label:
        effect.outcome.status === "verified"
          ? "结果已核验"
          : `结果状态：${effect.outcome.status}`,
      detail: effect.outcome.summary,
      time: effect.outcome.created_at,
      state: effect.outcome.status,
    });
  }

  if (reversalAttempt?.outcome) {
    items.push({
      id: reversalAttempt.outcome.id,
      label:
        reversalAttempt.outcome.status === "verified"
          ? "撤销已核验"
          : `撤销状态：${reversalAttempt.outcome.status}`,
      detail: reversalAttempt.outcome.summary,
      time: reversalAttempt.outcome.created_at,
      state: `reversal-${reversalAttempt.outcome.status}`,
    });
  }

  return items.sort(
    (left, right) =>
      new Date(right.time).getTime() - new Date(left.time).getTime(),
  );
}

export function RelationshipOutcomeTimeline({
  workspace,
}: {
  workspace: WorkspaceReviewResponse;
}) {
  const timeline = buildRelationshipOutcomeTimeline(workspace);

  return (
    <section className="context-history">
      <div className="context-history__heading">
        <div>
          <p className="eyebrow">关系历史</p>
          <h2>从证据到结果</h2>
        </div>
        <Clock aria-hidden="true" size={19} />
      </div>
      <ol>
        {timeline.map((item) => (
          <li data-state={item.state} key={item.id}>
            <i aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              <time dateTime={item.time}>{formatDate(item.time)}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
