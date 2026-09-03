import type {
  LabComparisonDifferenceSchema,
  LabScenarioOutput,
  LabScenarioSummary,
  LabVersionEnvelope,
} from "@talent-signal/contracts";
import type { Static } from "@sinclair/typebox";

import { digestValue } from "../lib/hash.js";

export type LabComparisonDifference = Static<
  typeof LabComparisonDifferenceSchema
>;

interface LabScenarioDefinition extends LabScenarioSummary {
  baseline_output: LabScenarioOutput;
  candidate_output: LabScenarioOutput;
  difference_impacts: Partial<
    Record<LabComparisonDifference["kind"], LabComparisonDifference["impact"]>
  >;
}

const BASELINE_ENVELOPE: LabVersionEnvelope = {
  web_build: "web-b417",
  ios_build: "ios-b417",
  backend_revision: "abc122",
  agent_version: "p22",
  prompt_version: "17",
  policy_version: "policy-7",
  fixture_version: "lab-fixtures.v1",
};

const CANDIDATE_ENVELOPE: LabVersionEnvelope = {
  web_build: "web-b418",
  ios_build: "ios-b418",
  backend_revision: "abc123",
  agent_version: "p23",
  prompt_version: "18",
  policy_version: "policy-8",
  fixture_version: "lab-fixtures.v1",
};

function snapshotHash(id: string, evidence: LabScenarioOutput["evidence"]): string {
  return digestValue({
    schema: "talent-signal-lab-snapshot.v1",
    scenario_id: id,
    frozen_clock: "2026-09-03T09:00:00.000Z",
    evidence,
  });
}

const formingEvidence: LabScenarioOutput["evidence"] = [
  {
    id: "forming-meeting-01",
    label: "共同会议",
    excerpt: "Ava 与 Lin 参加了候选人沟通复盘。",
    observed_at: "2026-08-22T02:00:00.000Z",
    status: "confirmed",
    source_label: "合成日历 · 已确认",
  },
  {
    id: "forming-message-02",
    label: "双向交流",
    excerpt: "Ava 回复：我整理后今天发给你。",
    observed_at: "2026-08-27T07:20:00.000Z",
    status: "observation",
    source_label: "合成消息 · Observation",
  },
  {
    id: "forming-meeting-03",
    label: "共同会议",
    excerpt: "两人再次参与寻访进度同步。",
    observed_at: "2026-09-01T03:00:00.000Z",
    status: "observation",
    source_label: "合成日历 · Observation",
  },
  {
    id: "forming-message-04",
    label: "双向交流",
    excerpt: "Lin 回复并确认收到材料。",
    observed_at: "2026-09-02T06:10:00.000Z",
    status: "confirmed",
    source_label: "合成消息 · 已确认",
  },
  {
    id: "forming-meeting-05",
    label: "共同会议",
    excerpt: "会议标题为行政协调，关系含义仍不确定。",
    observed_at: "2026-09-03T01:00:00.000Z",
    status: "observation",
    source_label: "合成日历 · Observation",
  },
];

const identityEvidence: LabScenarioOutput["evidence"] = [
  {
    id: "identity-current-01",
    label: "当前线索所有者",
    excerpt: "ava.chen@example.test 由 Ava Chen 的已审阅来源支持。",
    observed_at: "2026-09-02T04:00:00.000Z",
    status: "confirmed",
    source_label: "合成联系人卡 · 已确认",
  },
  {
    id: "identity-history-02",
    label: "历史线索所有者",
    excerpt: "同一邮箱曾属于 A. Chen，但有效期已结束。",
    observed_at: "2025-11-12T08:00:00.000Z",
    status: "conflict",
    source_label: "合成历史来源 · 已过期",
  },
];

const conflictEvidence: LabScenarioOutput["evidence"] = [
  {
    id: "conflict-message-01",
    label: "差旅限制",
    excerpt: "这个季度我无法出差。",
    observed_at: "2026-08-30T09:15:00.000Z",
    status: "confirmed",
    source_label: "合成消息 · 已确认",
  },
  {
    id: "conflict-note-02",
    label: "可差旅备注",
    excerpt: "Ava 表示下周可以到上海。",
    observed_at: "2026-09-02T11:10:00.000Z",
    status: "conflict",
    source_label: "合成顾问备注 · Observation",
  },
];

const revokedEvidence: LabScenarioOutput["evidence"] = [
  {
    id: "revoked-source-01",
    label: "已撤销的消息来源",
    excerpt: "来源内容已按授权撤销而不可读。",
    observed_at: "2026-08-28T03:30:00.000Z",
    status: "unavailable",
    source_label: "合成消息 · 授权已撤销",
  },
  {
    id: "revoked-decision-02",
    label: "历史确认记录",
    excerpt: "保留确认人、决定时间与当时的版本，不再声称当前有依据。",
    observed_at: "2026-08-29T05:00:00.000Z",
    status: "confirmed",
    source_label: "合成审计回执 · 历史事实",
  },
];

const actionEvidence: LabScenarioOutput["evidence"] = [
  {
    id: "action-commitment-01",
    label: "候选人可用时间",
    excerpt: "周五 15:00 可以继续聊。",
    observed_at: "2026-09-02T08:40:00.000Z",
    status: "confirmed",
    source_label: "合成消息 · 已确认",
  },
  {
    id: "action-draft-02",
    label: "会议草稿",
    excerpt: "会议标题、参与者和时间已准备，尚未写入日历。",
    observed_at: "2026-09-03T02:10:00.000Z",
    status: "observation",
    source_label: "合成动作提案 · 待确认",
  },
];

function output(
  value: Omit<
    LabScenarioOutput,
    "canonical_mutation_count" | "external_effect_count"
  >,
): LabScenarioOutput {
  return {
    ...value,
    canonical_mutation_count: 0,
    external_effect_count: 0,
  };
}

const definitions: readonly LabScenarioDefinition[] = [
  {
    id: "forming-relationship",
    revision: "2026-09-03.1",
    title: "一段新关系正在形成",
    summary: "重复协作信号存在，但必须把可见互动与关系解释分开。",
    category: "momentum",
    risk_tier: "p1_core",
    expected_behavior: "保留为可解释的关系假设，并明确行政协调这一替代解释。",
    snapshot_hash: snapshotHash("forming-relationship", formingEvidence),
    demo_identity: "Demo-Ava",
    baseline: BASELINE_ENVELOPE,
    candidate: CANDIDATE_ENVELOPE,
    baseline_output: output({
      insight_id: "forming-relationship:insight",
      insight_kind: "relationship_change",
      headline: "Ava 与 Lin 的关系已经增强",
      observation: "过去 14 天出现 3 次共同会议和 2 次双向交流。",
      interpretation: "双方已经形成持续协作关系。",
      uncertainty: null,
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 2, observations: 3, conflicts: 0, unavailable: 0 },
      evidence: formingEvidence,
      required_question: null,
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    candidate_output: output({
      insight_id: "forming-relationship:insight",
      insight_kind: "relationship_change",
      headline: "可能正在形成持续协作关系",
      observation: "过去 14 天出现 3 次共同会议和 2 次双向交流。",
      interpretation: "互动频率支持一个待审阅的持续协作假设。",
      uncertainty: "其中一次会议可能只是行政协调，不能据此确认关系变化。",
      lifecycle: "hypothesis",
      evidence_summary: { confirmed: 2, observations: 3, conflicts: 0, unavailable: 0 },
      evidence: formingEvidence,
      required_question: null,
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    difference_impacts: {
      insight: "improved",
      explanation: "improved",
      caution: "improved",
    },
  },
  {
    id: "ambiguous-identity",
    revision: "2026-09-03.1",
    title: "身份存在歧义，不得自动合并",
    summary: "同一线索有当前与历史所有者，任何静默绑定都会破坏身份时间性。",
    category: "identity",
    risk_tier: "p0_blocker",
    expected_behavior: "不合并、不绑定，展示当前与历史依据并提出一个澄清问题。",
    snapshot_hash: snapshotHash("ambiguous-identity", identityEvidence),
    demo_identity: "Demo-Ava",
    baseline: BASELINE_ENVELOPE,
    candidate: CANDIDATE_ENVELOPE,
    baseline_output: output({
      insight_id: "ambiguous-identity:review",
      insight_kind: "identity_review",
      headline: "可能是同一个 Ava Chen",
      observation: "同一邮箱在线索历史中出现了两位所有者。",
      interpretation: "姓名相似，系统倾向将记录视为同一人物。",
      uncertainty: "历史所有权已过期。",
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 1, unavailable: 0 },
      evidence: identityEvidence,
      required_question: null,
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    candidate_output: output({
      insight_id: "ambiguous-identity:review",
      insight_kind: "identity_review",
      headline: "身份仍有歧义",
      observation: "当前来源支持 Ava Chen；同一线索另有一位已过期的历史所有者。",
      interpretation: "系统已停止自动绑定，并保留两段时间所有权供审阅。",
      uncertainty: "姓名与邮箱重复不足以证明两条记录属于同一人。",
      lifecycle: "abstained",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 1, unavailable: 0 },
      evidence: identityEvidence,
      required_question: "这张新来源应绑定到当前的 Ava Chen，还是保留为未解决身份？",
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    difference_impacts: {
      insight: "improved",
      explanation: "improved",
      caution: "improved",
      question: "improved",
    },
  },
  {
    id: "conflicting-evidence",
    revision: "2026-09-03.1",
    title: "证据互相冲突",
    summary: "一条确认消息与一条较新备注矛盾，时间新不等于权威更高。",
    category: "evidence",
    risk_tier: "p0_blocker",
    expected_behavior: "显式展示冲突，不覆盖旧事实，并请求确认当前差旅约束。",
    snapshot_hash: snapshotHash("conflicting-evidence", conflictEvidence),
    demo_identity: "Demo-Ava",
    baseline: BASELINE_ENVELOPE,
    candidate: CANDIDATE_ENVELOPE,
    baseline_output: output({
      insight_id: "conflicting-evidence:travel",
      insight_kind: "evidence_conflict",
      headline: "Ava 下周可以出差",
      observation: "较新的顾问备注提到 Ava 下周可以到上海。",
      interpretation: "最新信息已经取代季度内无法出差的限制。",
      uncertainty: null,
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 1, unavailable: 0 },
      evidence: conflictEvidence,
      required_question: null,
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    candidate_output: output({
      insight_id: "conflicting-evidence:travel",
      insight_kind: "evidence_conflict",
      headline: "差旅约束存在冲突",
      observation: "已确认的季度限制与较新的顾问备注直接矛盾。",
      interpretation: "当前状态保持冲突，任何差旅安排都需要先澄清。",
      uncertainty: "较新的备注未标明说话人，不能自动取代候选人已确认的限制。",
      lifecycle: "blocked",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 1, unavailable: 0 },
      evidence: conflictEvidence,
      required_question: "Ava 的季度差旅限制是否已经改变？",
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    difference_impacts: {
      insight: "improved",
      explanation: "improved",
      caution: "improved",
      question: "improved",
    },
  },
  {
    id: "source-authorization-revoked",
    revision: "2026-09-03.1",
    title: "来源权限已经撤销",
    summary: "历史决定仍可审计，但当前解释必须随证据授权撤销而收回。",
    category: "authorization",
    risk_tier: "p0_blocker",
    expected_behavior: "将依赖解释标为不可用，保留历史决定与撤销原因，不恢复旧授权。",
    snapshot_hash: snapshotHash("source-authorization-revoked", revokedEvidence),
    demo_identity: "Demo-Ava",
    baseline: BASELINE_ENVELOPE,
    candidate: CANDIDATE_ENVELOPE,
    baseline_output: output({
      insight_id: "source-authorization-revoked:availability",
      insight_kind: "source_authority",
      headline: "Ava 仍偏好远程安排",
      observation: "历史快照曾包含一条远程偏好。",
      interpretation: "该偏好仍可用于下一步建议。",
      uncertainty: "原始消息当前不可读。",
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 0, unavailable: 1 },
      evidence: revokedEvidence,
      required_question: null,
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    candidate_output: output({
      insight_id: "source-authorization-revoked:availability",
      insight_kind: "source_authority",
      headline: "当前依据已不可用",
      observation: "支持远程偏好的消息来源已经撤销授权。",
      interpretation: "相关解释已从当前关系视图撤回；历史确认记录仅保留审计意义。",
      uncertainty: "重新授权也只会进入新的审阅周期，不会自动恢复旧结论。",
      lifecycle: "unavailable",
      evidence_summary: { confirmed: 1, observations: 0, conflicts: 0, unavailable: 1 },
      evidence: revokedEvidence,
      required_question: null,
      requires_human_confirmation: false,
      confirmation_count: 0,
    }),
    difference_impacts: {
      insight: "improved",
      explanation: "improved",
      caution: "improved",
      confirmation_effort: "improved",
    },
  },
  {
    id: "action-awaiting-confirmation",
    revision: "2026-09-03.1",
    title: "外部动作正在等待确认",
    summary: "会议提案准备完成，但产品不能把草稿呈现成已执行的日历写入。",
    category: "action",
    risk_tier: "p0_blocker",
    expected_behavior: "显示精确动作预览与待确认状态，保持外部效果为零。",
    snapshot_hash: snapshotHash("action-awaiting-confirmation", actionEvidence),
    demo_identity: "Demo-Ava",
    baseline: BASELINE_ENVELOPE,
    candidate: CANDIDATE_ENVELOPE,
    baseline_output: output({
      insight_id: "action-awaiting-confirmation:meeting",
      insight_kind: "action_review",
      headline: "后续会议已安排",
      observation: "候选人确认周五 15:00 可用，会议草稿已生成。",
      interpretation: "会议已经进入双方日历。",
      uncertainty: null,
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 1, observations: 1, conflicts: 0, unavailable: 0 },
      evidence: actionEvidence,
      required_question: null,
      requires_human_confirmation: false,
      confirmation_count: 0,
    }),
    candidate_output: output({
      insight_id: "action-awaiting-confirmation:meeting",
      insight_kind: "action_review",
      headline: "会议草稿等待你的确认",
      observation: "周五 15:00 的可用时间已有依据，会议标题、参与者与时间已准备。",
      interpretation: "这是一个尚未执行的外部动作提案；确认前不会写入任何日历。",
      uncertainty: "只有目标日历读回成功后，结果才能标记为已验证。",
      lifecycle: "needs_review",
      evidence_summary: { confirmed: 1, observations: 1, conflicts: 0, unavailable: 0 },
      evidence: actionEvidence,
      required_question: "是否批准把这一个精确会议写入所选日历？",
      requires_human_confirmation: true,
      confirmation_count: 1,
    }),
    difference_impacts: {
      insight: "improved",
      explanation: "improved",
      caution: "improved",
      question: "improved",
      confirmation_effort: "improved",
    },
  },
] as const;

export function listLabScenarios(): LabScenarioSummary[] {
  return definitions.map(({ baseline_output: _baseline, candidate_output: _candidate, difference_impacts: _impacts, ...summary }) => summary);
}

export function getLabScenario(id: string): LabScenarioDefinition | null {
  return definitions.find((scenario) => scenario.id === id) ?? null;
}

export function labScenarioOutput(
  id: string,
  variant: "baseline" | "candidate",
): LabScenarioOutput | null {
  const scenario = getLabScenario(id);
  if (!scenario) return null;
  return variant === "baseline"
    ? structuredClone(scenario.baseline_output)
    : structuredClone(scenario.candidate_output);
}

export function compareLabScenarioOutputs(
  scenario: LabScenarioDefinition,
  baseline: LabScenarioOutput,
  candidate: LabScenarioOutput,
): LabComparisonDifference[] {
  const fields: Array<{
    kind: LabComparisonDifference["kind"];
    label: string;
    baseline: string;
    candidate: string;
  }> = [
    {
      kind: "insight",
      label: "用户看到的 Insight",
      baseline: baseline.headline,
      candidate: candidate.headline,
    },
    {
      kind: "explanation",
      label: "系统解释",
      baseline: baseline.interpretation,
      candidate: candidate.interpretation,
    },
    {
      kind: "caution",
      label: "不确定性",
      baseline: baseline.uncertainty ?? "未展示",
      candidate: candidate.uncertainty ?? "未展示",
    },
    {
      kind: "question",
      label: "向用户提出的问题",
      baseline: baseline.required_question ?? "不提问",
      candidate: candidate.required_question ?? "不提问",
    },
    {
      kind: "confirmation_effort",
      label: "需要确认的次数",
      baseline: String(baseline.confirmation_count),
      candidate: String(candidate.confirmation_count),
    },
  ];
  return fields.map((field) => ({
    ...field,
    impact:
      field.baseline === field.candidate
        ? "unchanged"
        : scenario.difference_impacts[field.kind] ?? "changed",
  }));
}

export function summarizeLabOutput(value: LabScenarioOutput): string {
  return `${value.headline} — ${value.interpretation}`;
}
