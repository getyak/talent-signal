"use client";

import { ArrowsHorizontal, CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
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
const dragLimit = 74;
const dragElastic = 0.16;

type DragState = {
  pointerId: number;
  startX: number;
  lastX: number;
  lastTime: number;
  offsetX: number;
  velocityX: number;
  didDrag: boolean;
};

function EvidenceClause({
  active,
  children,
  id,
  onToggle,
}: EvidenceClauseProps) {
  const reduceMotion = useReducedMotionPreference();
  const ignoreClickRef = useRef(false);
  const resetClickTimerRef = useRef<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

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

  function resetDragStyle(element: HTMLButtonElement) {
    element.dataset.dragging = "false";
    element.style.setProperty("--evidence-drag-x", "0px");
    element.style.setProperty("--evidence-drag-rotate", "0deg");
    element.style.setProperty("--evidence-drag-scale", "1");
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (reduceMotion || event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      offsetX: 0,
      velocityX: 0,
      didDrag: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const rawOffset = event.clientX - state.startX;
    const boundedOffset = Math.max(-dragLimit, Math.min(dragLimit, rawOffset));
    const visualOffset =
      boundedOffset + (rawOffset - boundedOffset) * dragElastic;
    const elapsed = Math.max(1, event.timeStamp - state.lastTime);

    state.offsetX = rawOffset;
    state.velocityX = ((event.clientX - state.lastX) / elapsed) * 1000;
    state.lastX = event.clientX;
    state.lastTime = event.timeStamp;
    state.didDrag ||= Math.abs(rawOffset) > 4;

    if (!state.didDrag) {
      return;
    }

    const element = event.currentTarget;
    const direction = active ? -1 : 1;
    const rotation =
      direction * Math.min(1.1, (Math.abs(visualOffset) / dragLimit) * 1.1);

    ignoreClickRef.current = true;
    element.dataset.dragging = "true";
    element.style.setProperty("--evidence-drag-x", `${visualOffset}px`);
    element.style.setProperty("--evidence-drag-rotate", `${rotation}deg`);
    element.style.setProperty("--evidence-drag-scale", "1.045");
  }

  function finishPointerDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    resetDragStyle(element);

    if (!state.didDrag) {
      return;
    }

    const movedBeyondThreshold =
      !cancelled &&
      (Math.abs(state.offsetX) >= dragThreshold ||
        Math.abs(state.velocityX) >= dragVelocityThreshold);

    if (movedBeyondThreshold) {
      onToggle(id);
    }
    resetIgnoredClick();
  }

  return (
    <button
      type="button"
      className={styles.evidenceClause}
      data-active={active}
      data-dragging="false"
      aria-pressed={active}
      aria-describedby="source-interaction-instruction"
      aria-controls={controlledChangeIds}
      draggable={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={(event) => finishPointerDrag(event, true)}
      onClick={() => {
        if (ignoreClickRef.current) {
          return;
        }
        onToggle(id);
      }}
    >
      {children}
    </button>
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
