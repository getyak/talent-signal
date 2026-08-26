"use client";

import type { PursuitProposal } from "@talent-signal/contracts";
import { CheckCircle, ShieldCheck } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  PursuitProposalReview,
  type PursuitReviewReceipt,
} from "./pursuit-proposal-review";
import styles from "./pursuit-room.module.css";

export function PursuitReviewGate({
  proposals,
}: {
  proposals: PursuitProposal[];
}) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<PursuitReviewReceipt | null>(null);
  const [reviewedProposalIds, setReviewedProposalIds] = useState<string[]>([]);
  const visible = proposals.filter(
    (proposal) => !reviewedProposalIds.includes(proposal.id),
  );
  const pending = visible.find((proposal) => proposal.status === "needs_review");
  const recovery = visible.filter((proposal) => proposal.id !== pending?.id);

  function recordReceipt(canonicalReceipt: PursuitReviewReceipt) {
    setReviewedProposalIds((current) =>
      current.includes(canonicalReceipt.proposalId)
        ? current
        : [...current, canonicalReceipt.proposalId],
    );
    setReceipt(canonicalReceipt);
    router.refresh();
  }

  return (
    <div className={styles.reviewGate}>
      <aside className={styles.section}>
        <header>
          <div>
            <p>Human decision gate</p>
            <h2>Review queue</h2>
          </div>
          <span>{visible.length} awaiting attention</span>
        </header>
        {visible.length ? (
          <div className={styles.history}>
            {visible.map((proposal) => (
              <article key={proposal.id}>
                <span>{proposal.status.replaceAll("_", " ")}</span>
                <strong>{proposal.summary}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.quiet}>No Proposal currently needs attention.</p>
        )}
      </aside>

      {receipt ? (
        <div className={styles.receipt} role="status" aria-live="polite">
          <CheckCircle aria-hidden="true" size={24} weight="fill" />
          <div>
            <p>Canonical receipt</p>
            <h3>{receipt.summary}</h3>
            <span>
              {receipt.changedFields.length} changed fields · {receipt.externalEffects} external effects
            </span>
          </div>
          {pending ? (
            <button onClick={() => setReceipt(null)} type="button">
              Review next Proposal
            </button>
          ) : null}
        </div>
      ) : pending ? (
        <PursuitProposalReview
          key={pending.id}
          onReviewed={recordReceipt}
          proposal={pending}
        />
      ) : recovery.length > 0 ? (
        <div className={styles.receipt}>
          <ShieldCheck aria-hidden="true" size={24} weight="fill" />
          <div>
            <p>Review state</p>
            <h3>No Proposal currently needs a decision.</h3>
            <span>Conflict or failure recovery remains visible above.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
