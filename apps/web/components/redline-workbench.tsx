"use client";

import {
  ArrowRight,
  Check,
  ShieldCheck,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  analyzeConversation,
  deriveInsight,
  sampleConversation,
  type EvidenceKind,
} from "@/lib/signals";
import styles from "@/app/redline-home.module.css";

const sample = analyzeConversation(sampleConversation);

type ChangeRow = {
  label: string;
  before: string;
  after: string;
  supported: boolean;
};

function buildChangeRows(selected: Set<EvidenceKind>): ChangeRow[] {
  return [
    {
      label: "Decision window",
      before: "No active deadline",
      after: selected.has("deadline")
        ? "Wednesday, candidate controlled"
        : "No supported change",
      supported: selected.has("deadline"),
    },
    {
      label: "Current pressure",
      before: "Unknown",
      after: selected.has("competing-offer")
        ? "Competing offer in hand"
        : "No supported change",
      supported: selected.has("competing-offer"),
    },
    {
      label: "Work mode",
      before: "Unconfirmed",
      after: selected.has("preference")
        ? "Remote flexibility is unresolved"
        : "No supported change",
      supported: selected.has("preference"),
    },
  ];
}

function getDependencyTitle(verdict: string) {
  switch (verdict) {
    case "At risk":
      return "Confirm remote policy first";
    case "Resolve blocker":
      return "Ask what must be true";
    case "Advance":
      return "Confirm Tuesday afternoon";
    default:
      return "No action is the right action";
  }
}

export function RedlineWorkbench() {
  const [selected, setSelected] = useState<Set<EvidenceKind>>(
    () => new Set(sample.evidence.map((item) => item.id)),
  );
  const [confirmed, setConfirmed] = useState(false);

  const visibleEvidence = useMemo(
    () => sample.evidence.filter((item) => selected.has(item.id)),
    [selected],
  );
  const insight = deriveInsight(visibleEvidence);
  const changeRows = buildChangeRows(selected);

  function toggleEvidence(id: EvidenceKind) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setConfirmed(false);
  }

  return (
    <div className={styles.workbench}>
      <section
        className={styles.sourcePane}
        aria-labelledby="source-conversation-title"
      >
        <div className={styles.paneHeader}>
          <span id="source-conversation-title">Source conversation</span>
          <span>Leila Hartmann</span>
        </div>

        <div className={styles.sourceMeta}>
          <div>
            <strong>Tuesday, 14:32</strong>
            <span>VP Product candidate</span>
          </div>
          <span className={styles.sourceAttached}>
            <ShieldCheck aria-hidden="true" size={17} />
            Source attached
          </span>
        </div>

        <blockquote className={styles.sourceQuote}>
          “I have{" "}
          <button
            type="button"
            className={styles.evidenceClause}
            data-active={selected.has("competing-offer")}
            aria-pressed={selected.has("competing-offer")}
            onClick={() => toggleEvidence("competing-offer")}
          >
            another offer
          </button>{" "}
          and need to decide{" "}
          <button
            type="button"
            className={styles.evidenceClause}
            data-active={selected.has("deadline")}
            aria-pressed={selected.has("deadline")}
            onClick={() => toggleEvidence("deadline")}
          >
            by Wednesday
          </button>
          . I can speak{" "}
          <button
            type="button"
            className={styles.evidenceClause}
            data-active={selected.has("availability")}
            aria-pressed={selected.has("availability")}
            onClick={() => toggleEvidence("availability")}
          >
            Tuesday afternoon
          </button>
          , but{" "}
          <button
            type="button"
            className={styles.evidenceClause}
            data-active={selected.has("preference")}
            aria-pressed={selected.has("preference")}
            onClick={() => toggleEvidence("preference")}
          >
            remote flexibility is important
          </button>
          .”
        </blockquote>

        <p className={styles.sourceInstruction}>
          Turn a clause off. Unsupported changes and actions retract with it.
        </p>
      </section>

      <section
        className={styles.changePane}
        aria-labelledby="proposed-change-title"
      >
        <div className={styles.paneHeader}>
          <span id="proposed-change-title">
            Proposed relationship change
          </span>
          <span>Review required</span>
        </div>

        <h2>What the record would change</h2>

        <dl className={styles.changeList}>
          {changeRows.map((row) => (
            <div key={row.label} data-supported={row.supported}>
              <dt>{row.label}</dt>
              <dd>
                <del>{row.before}</del>
                <ins>{row.after}</ins>
              </dd>
            </div>
          ))}
        </dl>

        <div className={styles.dependency} aria-live="polite">
          <div>
            <span>Current dependency</span>
            <strong>{getDependencyTitle(insight.verdict)}</strong>
            <p>{insight.nextAction}</p>
          </div>
          <span className={styles.dependencyWindow}>
            {selected.has("deadline") ? "Before Wed" : "No deadline"}
          </span>
        </div>

        <div className={styles.approvalRow}>
          <div>
            <span>Relationship state</span>
            <button
              type="button"
              className={styles.confirmButton}
              disabled={visibleEvidence.length === 0}
              onClick={() => setConfirmed(true)}
            >
              {confirmed ? (
                <>
                  <Check aria-hidden="true" size={16} />
                  Facts confirmed
                </>
              ) : (
                "Confirm facts"
              )}
            </button>
          </div>
          <div>
            <span>External action</span>
            <button
              type="button"
              className={styles.separateButton}
              disabled
              title="External action requires a separate review"
            >
              Approve separately
            </button>
          </div>
        </div>

        <Link className={styles.workbenchLink} href="/demo">
          Open full evidence review
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </div>
  );
}
