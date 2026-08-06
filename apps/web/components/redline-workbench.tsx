"use client";

import { ArrowsHorizontal, CheckCircle } from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeConversation,
  deriveInsight,
  sampleConversation,
  type EvidenceKind,
} from "@/lib/signals";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";
import styles from "@/app/redline-home.module.css";

const sample = analyzeConversation(sampleConversation);
const controlledChangeIds =
  "proposed-change-list current-dependency approval-boundary";

type ChangeRow = {
  label: string;
  before: string;
  after: string;
  evidenceId: EvidenceKind;
  supported: boolean;
};

type EvidenceClauseProps = {
  active: boolean;
  children: ReactNode;
  id: EvidenceKind;
  onToggle: (id: EvidenceKind) => void;
};

const dragThreshold = 46;
const dragVelocityThreshold = 520;

function EvidenceClause({
  active,
  children,
  id,
  onToggle,
}: EvidenceClauseProps) {
  const reduceMotion = useReducedMotionPreference();
  const ignoreClickRef = useRef(false);
  const resetClickTimerRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      if (resetClickTimerRef.current !== null) {
        window.clearTimeout(resetClickTimerRef.current);
      }
    },
    [],
  );

  function resetIgnoredClick() {
    if (resetClickTimerRef.current !== null) {
      window.clearTimeout(resetClickTimerRef.current);
    }
    resetClickTimerRef.current = window.setTimeout(() => {
      ignoreClickRef.current = false;
      resetClickTimerRef.current = null;
    }, 0);
  }

  return (
    <motion.button
      type="button"
      className={styles.evidenceClause}
      data-active={active}
      data-dragging={dragging}
      aria-pressed={active}
      aria-describedby="source-interaction-instruction"
      aria-controls={controlledChangeIds}
      drag={reduceMotion ? false : "x"}
      dragConstraints={{ left: -74, right: 74 }}
      dragElastic={0.16}
      dragMomentum={false}
      dragSnapToOrigin
      whileDrag={
        reduceMotion
          ? undefined
          : {
              scale: 1.045,
              rotate: active ? -1.1 : 1.1,
            }
      }
      transition={{
        type: "spring",
        stiffness: 520,
        damping: 34,
        mass: 0.72,
      }}
      onDragStart={() => {
        ignoreClickRef.current = true;
        setDragging(true);
      }}
      onDragEnd={(_event, info) => {
        const movedBeyondThreshold =
          Math.abs(info.offset.x) >= dragThreshold ||
          Math.abs(info.velocity.x) >= dragVelocityThreshold;

        setDragging(false);
        if (movedBeyondThreshold) {
          onToggle(id);
        }
        resetIgnoredClick();
      }}
      onClick={() => {
        if (ignoreClickRef.current) {
          return;
        }
        onToggle(id);
      }}
    >
      {children}
    </motion.button>
  );
}

function buildChangeRows(selected: Set<EvidenceKind>): ChangeRow[] {
  return [
    {
      label: "Decision window",
      before: "No active deadline",
      after: selected.has("deadline")
        ? "Wednesday, candidate controlled"
        : "No supported change",
      evidenceId: "deadline",
      supported: selected.has("deadline"),
    },
    {
      label: "Current pressure",
      before: "Unknown",
      after: selected.has("competing-offer")
        ? "Competing offer in hand"
        : "No supported change",
      evidenceId: "competing-offer",
      supported: selected.has("competing-offer"),
    },
    {
      label: "Work mode",
      before: "Unconfirmed",
      after: selected.has("preference")
        ? "Remote flexibility is unresolved"
        : "No supported change",
      evidenceId: "preference",
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
  const [lastChange, setLastChange] = useState<{
    id: EvidenceKind;
    version: number;
  } | null>(null);

  const visibleEvidence = useMemo(
    () => sample.evidence.filter((item) => selected.has(item.id)),
    [selected],
  );
  const insight = deriveInsight(visibleEvidence);
  const changeRows = buildChangeRows(selected);

  function toggleEvidence(id: EvidenceKind) {
    setLastChange((current) => ({
      id,
      version: (current?.version ?? 0) + 1,
    }));
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
            Source attached
          </span>
        </div>

        <p
          id="source-interaction-instruction"
          className={styles.sourceInstruction}
        >
          <strong>
            <span className={styles.motionOnly}>Move one marked phrase aside</span>
            <span className={styles.reducedMotionOnly}>
              Select one marked phrase
            </span>
          </strong>
          <span>
            <span className={styles.motionOnly}>Or select it. </span>
            Dependent state and action retract together.
          </span>
          <span
            className={`${styles.dragHint} ${styles.motionOnly}`}
            aria-hidden="true"
          >
            <ArrowsHorizontal size={14} weight="bold" />
            Drag to change evidence scope
          </span>
        </p>

        <blockquote className={styles.sourceQuote}>
          “I have{" "}
          <EvidenceClause
            id="competing-offer"
            active={selected.has("competing-offer")}
            onToggle={toggleEvidence}
          >
            another offer
          </EvidenceClause>{" "}
          and need to decide{" "}
          <EvidenceClause
            id="deadline"
            active={selected.has("deadline")}
            onToggle={toggleEvidence}
          >
            by Wednesday
          </EvidenceClause>
          . I can speak{" "}
          <EvidenceClause
            id="availability"
            active={selected.has("availability")}
            onToggle={toggleEvidence}
          >
            Tuesday afternoon
          </EvidenceClause>
          , but{" "}
          <EvidenceClause
            id="preference"
            active={selected.has("preference")}
            onToggle={toggleEvidence}
          >
            remote flexibility is important
          </EvidenceClause>
          <span className={styles.quoteClose}>.”</span>
        </blockquote>

        <p className={styles.sourceScope} aria-live="polite">
          {visibleEvidence.length === sample.evidence.length
            ? `All ${sample.evidence.length} evidence clauses are in scope.`
            : `${visibleEvidence.length} of ${sample.evidence.length} evidence clauses remain in scope. Dependent state recalculated.`}
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

        <dl id="proposed-change-list" className={styles.changeList}>
          {changeRows.map((row) => (
            <div
              key={`${row.label}-${
                lastChange?.id === row.evidenceId
                  ? lastChange.version
                  : "stable"
              }`}
              data-changed={lastChange?.id === row.evidenceId}
              data-supported={row.supported}
            >
              <dt>{row.label}</dt>
              <dd>
                <del>{row.before}</del>
                <ins>{row.after}</ins>
              </dd>
            </div>
          ))}
        </dl>

        <div
          id="current-dependency"
          key={`${insight.verdict}-${visibleEvidence.length}`}
          className={styles.dependency}
          aria-live="polite"
        >
          <div>
            <span>Current dependency</span>
            <strong>{getDependencyTitle(insight.verdict)}</strong>
            <p>{insight.nextAction}</p>
          </div>
          <span className={styles.dependencyWindow}>
            {selected.has("deadline") ? "Before Wed" : "No deadline"}
          </span>
        </div>

        <div id="approval-boundary" className={styles.approvalRow}>
          <div>
            <span>Relationship state</span>
            <button
              type="button"
              className={styles.confirmButton}
              data-confirmed={confirmed}
              disabled={visibleEvidence.length === 0}
              onClick={() => setConfirmed(true)}
            >
              {confirmed && (
                <CheckCircle aria-hidden="true" size={17} weight="bold" />
              )}
              <span>{confirmed ? "Facts confirmed" : "Confirm facts"}</span>
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
            <small className={styles.approvalNote}>
              Separate review required
            </small>
          </div>
        </div>

        <Link className={styles.workbenchLink} href="/demo">
          Open full evidence review
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
