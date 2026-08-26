"use client";

import type { PursuitProposal } from "@talent-signal/contracts";
import {
  CheckCircle,
  PencilSimple,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

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
  onReviewed?: (receipt: PursuitReviewReceipt) => void;
  proposal: PursuitProposal;
};

function changeLabel(value: PursuitProposal["items"][number]["change_kind"]) {
  return {
    set_milestone: "Milestone",
    set_pursuit_status: "Pursuit status",
    set_role_status: "Role status",
    add_gap: "New gap",
    add_action: "New internal action",
  }[value];
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value.replaceAll("_", " ");
  if (value === null || value === undefined) return "Not recorded";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.title ?? record.label ?? JSON.stringify(record));
  }
  return String(value);
}

function initialEditValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function PursuitProposalReview({ onReviewed, proposal }: Props) {
  const { sessionRecoveryHref } = useWorkspaceSessionRecovery(null);
  const [decisions, setDecisions] = useState<
    Record<string, { decision: Decision; editedValue: string }>
  >({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PursuitReviewReceipt | null>(null);
  const allDecided = proposal.items.every((item) => decisions[item.id]);

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
        if (!selected) throw new Error("Every change needs a decision.");
        if (selected.decision !== "edit") {
          return { item_id: item.id, decision: selected.decision };
        }
        let editedValue: unknown = selected.editedValue.trim();
        if (typeof item.proposed_value !== "string") {
          try {
            editedValue = JSON.parse(selected.editedValue) as unknown;
          } catch {
            throw new Error(
              `The edited ${changeLabel(item.change_kind).toLowerCase()} must be valid JSON.`,
            );
          }
        }
        return {
          item_id: item.id,
          decision: selected.decision,
          edited_value: editedValue,
        };
      });
      const operationId = crypto.randomUUID();
      const response = await workspaceSessionFetch(
        `/api/pursuit-proposals/${proposal.id}/reviews`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation_id: operationId,
            idempotency_key: operationId,
            base_revision: proposal.base_revision,
            reason: reason.trim(),
            decisions: reviewDecisions,
          }),
        },
      );
      const payload = (await response.json()) as {
        receipt?: {
          summary: string;
          changed_fields: string[];
          external_effects: unknown[];
        };
        error?: { message?: string };
      };
      if (workspaceSessionExpired(response.status, payload)) return;
      if (!response.ok || !payload.receipt) {
        throw new Error(
          payload.error?.message ??
            "Canonical readback did not confirm the review. Nothing is shown as applied.",
        );
      }
      const canonicalReceipt = {
        proposalId: proposal.id,
        summary: payload.receipt.summary,
        changedFields: payload.receipt.changed_fields,
        externalEffects: payload.receipt.external_effects.length,
      };
      setReceipt(canonicalReceipt);
      onReviewed?.(canonicalReceipt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The review could not be verified.",
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
          <p>Canonical receipt</p>
          <h3>{receipt.summary}</h3>
          <span>
            {receipt.changedFields.length} changed fields · {receipt.externalEffects} external effects
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.proposal} id="proposal">
      <header>
        <div>
          <p>Review-only Agent Proposal</p>
          <h2>{proposal.summary}</h2>
          <span>
            {proposal.review_context.subject.display_label} · Pursuit revision {proposal.base_revision}
          </span>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" size={18} />
          No external effects
        </div>
      </header>

      <div className={styles.proposalEvidence}>
        <p>Exact evidence</p>
        {proposal.review_context.evidence.map((evidence) => (
          <blockquote key={evidence.fragment_id}>
            “{evidence.text ?? "Source text is no longer available."}”
            <cite>
              {evidence.source_display_name} · {evidence.attribution_status} attribution · {evidence.review_status}
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
                  <span>Before</span>
                  <strong>{displayValue(item.before_value)}</strong>
                </p>
                <PencilSimple aria-hidden="true" size={17} />
                <p>
                  <span>Proposed</span>
                  <strong>{displayValue(item.proposed_value)}</strong>
                </p>
              </div>
              <p className={styles.proposalReason}>{item.reason}</p>
              <div className={styles.decisionOptions}>
                {(
                  [
                    ["confirm", "Confirm"],
                    ["edit", "Edit"],
                    ["reject", "Reject"],
                    ["keep_unresolved", "Keep unresolved"],
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
                  Edited value
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
          Decision basis
          <textarea
            maxLength={1_000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Record why these exact decisions are appropriate now…"
            rows={3}
            value={reason}
          />
        </label>
        <div>
          <p>
            {proposal.items.length - Object.keys(decisions).length} decisions remaining.
            Submission applies only confirmed or edited items and returns canonical readback.
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
            {submitting ? "Verifying canonical write…" : "Submit exact review"}
          </button>
        </div>
      </div>

      {sessionRecoveryHref ? (
        <div className={styles.reviewError} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <p>
            <strong>Sign in before reviewing this Proposal</strong>
            <span>
              Your decisions remain visible on this page, but no canonical
              write can be attempted until the account session is restored.
            </span>
          </p>
          <Link href={sessionRecoveryHref}>Sign in again</Link>
        </div>
      ) : null}

      {error ? (
        <div className={styles.reviewError} role="alert">
          <WarningCircle aria-hidden="true" size={20} />
          <p>
            <strong>Review not verified</strong>
            <span>{error}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
