"use client";

import type {
  AgentTaskProjection,
  PursuitProposal,
} from "@talent-signal/contracts";
import {
  CheckCircle,
  PencilSimple,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useWorkspaceSessionRecovery } from "./use-workspace-session-recovery";
import {
  workspaceSessionExpired,
  workspaceSessionFetch,
} from "./workspace-session-request";
import styles from "./pursuit-room.module.css";

type Decision = "confirm" | "edit" | "reject" | "keep_unresolved";

export type PursuitReviewReceipt = {
  proposalId: string;
  summary: string;
  changedFields: string[];
  externalEffects: number;
};

type Props = {
  decisionBundle?: NonNullable<AgentTaskProjection["decision_bundle"]>;
  onReviewed?: (receipt: PursuitReviewReceipt) => void;
  proposal: PursuitProposal;
};

function changeLabel(value: PursuitProposal["items"][number]["change_kind"]) {
  return {
    set_milestone: "里程碑",
    set_pursuit_status: "寻访状态",
    set_role_status: "角色状态",
    add_gap: "新增缺口",
    add_action: "新增内部行动",
  }[value];
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value.replaceAll("_", " ");
  if (value === null || value === undefined) return "尚未记录";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.title ?? record.label ?? JSON.stringify(record));
  }
  return String(value);
}

function initialEditValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function PursuitProposalReview({
  decisionBundle,
  onReviewed,
  proposal,
}: Props) {
  const proposalRef = useRef<HTMLElement>(null);
  const { sessionRecoveryHref } = useWorkspaceSessionRecovery(null);
  const [decisions, setDecisions] = useState<
    Record<string, { decision: Decision; editedValue: string }>
  >({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PursuitReviewReceipt | null>(null);
  const allDecided = proposal.items.every((item) => decisions[item.id]);

  useEffect(() => {
    if (window.location.hash !== "#proposal") return;
    const frame = window.requestAnimationFrame(() => {
      proposalRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [proposal.id]);

  function decide(itemId: string, decision: Decision, proposedValue: unknown) {
    setDecisions((current) => ({
      ...current,
      [itemId]: {
        decision,
        editedValue:
          current[itemId]?.editedValue ?? initialEditValue(proposedValue),
      },
    }));
  }

  async function submitReview() {
    if (!allDecided || !reason.trim() || submitting || sessionRecoveryHref) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reviewDecisions = proposal.items.map((item) => {
        const selected = decisions[item.id];
        if (!selected) throw new Error("每项变更都需要一个决定。");
        const correlatedItem = decisionBundle?.items.find(
          (candidate) => candidate.domain_subject_id === item.id,
        );
        if (decisionBundle && !correlatedItem) {
          throw new Error("决定项与规范提案不一致，请刷新后重试。");
        }
        const itemId = correlatedItem?.id ?? item.id;
        const decision =
          decisionBundle && selected.decision === "confirm"
            ? "accept"
            : selected.decision;
        if (selected.decision !== "edit") {
          return { item_id: itemId, decision };
        }
        let editedValue: unknown = selected.editedValue.trim();
        if (typeof item.proposed_value !== "string") {
          try {
            editedValue = JSON.parse(selected.editedValue) as unknown;
          } catch {
            throw new Error(
              `编辑后的${changeLabel(item.change_kind)}必须是有效 JSON。`,
            );
          }
        }
        return {
          item_id: itemId,
          decision,
          edited_value: editedValue,
        };
      });
      const operationId = crypto.randomUUID();
      const response = await workspaceSessionFetch(
        decisionBundle
          ? `/api/agent-decision-bundles/${decisionBundle.id}/resolve`
          : `/api/pursuit-proposals/${proposal.id}/reviews`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation_id: operationId,
            idempotency_key: operationId,
            ...(decisionBundle
              ? {
                  expected_task_revision: decisionBundle.task_revision,
                  expected_bundle_revision: decisionBundle.bundle_revision,
                }
              : {}),
            base_revision: proposal.base_revision,
            reason: reason.trim(),
            decisions: reviewDecisions,
          }),
        },
      );
      const payload = (await response.json()) as {
        domain_receipt?: {
          summary: string;
          changed_fields: string[];
          external_effects: unknown[];
        };
        receipt?: {
          summary: string;
          changed_fields: string[];
          external_effects: unknown[];
        };
        error?: { message?: string };
      };
      if (workspaceSessionExpired(response.status, payload)) return;
      const canonicalDomainReceipt = payload.domain_receipt ?? payload.receipt;
      if (!response.ok || !canonicalDomainReceipt) {
        throw new Error(
          payload.error?.message ??
            "规范状态读取未能确认本次审阅，因此不会把任何内容显示为已应用。",
        );
      }
      const canonicalReceipt = {
        proposalId: proposal.id,
        summary: canonicalDomainReceipt.summary,
        changedFields: canonicalDomainReceipt.changed_fields,
        externalEffects: canonicalDomainReceipt.external_effects.length,
      };
      setReceipt(canonicalReceipt);
      onReviewed?.(canonicalReceipt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "无法核验本次审阅。",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className={styles.receipt} role="status" aria-live="polite">
        <CheckCircle aria-hidden="true" size={24} weight="fill" />
        <div>
          <p>规范回执</p>
          <h3>{receipt.summary}</h3>
          <span>
            {receipt.changedFields.length} 个字段已改变 · {receipt.externalEffects} 项外部效果
          </span>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`pursuit-proposal-${proposal.id}-title`}
      className={styles.proposal}
      id="proposal"
      ref={proposalRef}
      tabIndex={-1}
    >
      <header>
        <div>
          <p>仅供审阅的智能助理提案</p>
          <h2 id={`pursuit-proposal-${proposal.id}-title`}>
            {proposal.summary}
          </h2>
          <span>
            {proposal.review_context.subject.display_label} · 寻访修订版本 {proposal.base_revision}
          </span>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" size={18} />
          无外部效果
        </div>
      </header>

      <div className={styles.proposalEvidence}>
        <p>准确证据</p>
        {proposal.review_context.evidence.map((evidence) => (
          <blockquote key={evidence.fragment_id}>
            “{evidence.text ?? "来源文本已不可用。"}”
            <cite>
              {evidence.source_display_name} · 归属状态：{evidence.attribution_status} · 审阅状态：{evidence.review_status}
            </cite>
          </blockquote>
        ))}
      </div>

      <div className={styles.proposalItems}>
        {proposal.items.map((item, index) => {
          const selected = decisions[item.id];
          return (
            <fieldset key={item.id}>
              <legend>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {changeLabel(item.change_kind)}
              </legend>
              <div className={styles.beforeAfter}>
                <p>
                  <span>之前</span>
                  <strong>{displayValue(item.before_value)}</strong>
                </p>
                <PencilSimple aria-hidden="true" size={17} />
                <p>
                  <span>拟议</span>
                  <strong>{displayValue(item.proposed_value)}</strong>
                </p>
              </div>
              <p className={styles.proposalReason}>{item.reason}</p>
              <div className={styles.decisionOptions}>
                {(
                  [
                    ["confirm", "确认"],
                    ["edit", "编辑"],
                    ["reject", "驳回"],
                    ["keep_unresolved", "保持未解决"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      checked={selected?.decision === value}
                      name={`decision-${item.id}`}
                      onChange={() => decide(item.id, value, item.proposed_value)}
                      type="radio"
                      value={value}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {selected?.decision === "edit" ? (
                <label className={styles.editValue}>
                  编辑后的值
                  {typeof item.proposed_value === "string" ? (
                    <input
                      maxLength={1_000}
                      onChange={(event) =>
                        setDecisions((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id]!,
                            editedValue: event.target.value,
                          },
                        }))
                      }
                      value={selected.editedValue}
                    />
                  ) : (
                    <textarea
                      onChange={(event) =>
                        setDecisions((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id]!,
                            editedValue: event.target.value,
                          },
                        }))
                      }
                      rows={5}
                      value={selected.editedValue}
                    />
                  )}
                </label>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className={styles.reviewCommit}>
        <label>
          决定依据
          <textarea
            maxLength={1_000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="记录这些具体决定为何此刻合适…"
            rows={3}
            value={reason}
          />
        </label>
        <div>
          <p>
            还剩 {proposal.items.length - Object.keys(decisions).length} 项决定。提交只会应用已确认或已编辑的项目，并返回规范状态读取。
          </p>
          <button
            disabled={
              !allDecided ||
              !reason.trim() ||
              submitting ||
              Boolean(sessionRecoveryHref)
            }
            onClick={submitReview}
            type="button"
          >
            {submitting ? "正在核验规范写入…" : "提交本次精确审阅"}
          </button>
        </div>
      </div>

      {sessionRecoveryHref ? (
        <div className={styles.reviewError} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <p>
            <strong>登录后再审阅该提案</strong>
            <span>
              你的决定会继续显示在本页，但在账号会话恢复前，不会尝试任何规范写入。
            </span>
          </p>
          <Link href={sessionRecoveryHref}>重新登录</Link>
        </div>
      ) : null}

      {error ? (
        <div className={styles.reviewError} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <p>
            <strong>审阅尚未核验</strong>
            <span>{error}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
