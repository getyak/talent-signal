"use client";

import {
  ArrowCounterClockwise,
  CalendarBlank,
  Check,
  CheckCircle,
  NotePencil,
  PencilSimple,
  UserCirclePlus,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  analyzeConversation,
  sampleConversation,
  type AnalysisResult,
  type ProposedAction,
} from "@/lib/signals";

type Phase = "error" | "idle" | "loading" | "ready";
type ActionStatus = "confirmed" | "dismissed" | "pending";

function ActionIcon({ type }: Pick<ProposedAction, "type">) {
  if (type === "create-meeting") {
    return <CalendarBlank aria-hidden="true" size={21} />;
  }
  return <UserCirclePlus aria-hidden="true" size={21} />;
}

function WorkbenchSkeleton() {
  return (
    <div className="workbench-skeleton" aria-label="Analyzing conversation">
      <div className="skeleton-line skeleton-line--short" />
      <div className="skeleton-line" />
      <div className="skeleton-panel">
        <div className="skeleton-line skeleton-line--medium" />
        <div className="skeleton-line" />
      </div>
      <span className="sr-only">Analyzing conversation</span>
    </div>
  );
}

function EmptyAnalysis() {
  return (
    <div className="empty-analysis">
      <NotePencil aria-hidden="true" size={28} />
      <div>
        <h3>No operational update yet</h3>
        <p>
          This note has context, but no explicit deadline, constraint, offer, or
          scheduling commitment.
        </p>
      </div>
    </div>
  );
}

export function DemoWorkbench() {
  const [input, setInput] = useState(sampleConversation);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function runAnalysis() {
    if (!input.trim()) {
      setPhase("error");
      setResult(null);
      return;
    }

    setPhase("loading");
    setStatuses({});
    setEditingId(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      const nextResult = analyzeConversation(input);
      setResult(nextResult);
      setEdits(
        Object.fromEntries(
          nextResult.actions.map((action) => [action.id, action.detail]),
        ),
      );
      setPhase("ready");
    }, reduceMotion ? 100 : 720);
  }

  function updateStatus(id: string, status: ActionStatus) {
    setStatuses((current) => ({ ...current, [id]: status }));
    setEditingId(null);
  }

  function resetDemo() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setInput(sampleConversation);
    setPhase("idle");
    setResult(null);
    setStatuses({});
    setEditingId(null);
    setEdits({});
  }

  const actionSummary = result
    ? Object.values(statuses).filter((status) => status === "confirmed").length
    : 0;

  return (
    <div className="demo-workbench">
      <section className="demo-input" aria-labelledby="demo-input-title">
        <div className="demo-input__heading">
          <div>
            <p className="metadata">Recruiter-controlled import</p>
            <h1 id="demo-input-title">Try one conversation.</h1>
          </div>
          <button className="text-button" type="button" onClick={resetDemo}>
            <ArrowCounterClockwise aria-hidden="true" size={16} />
            Reset demo
          </button>
        </div>

        <div className="field">
          <label htmlFor="candidate-context">Candidate context</label>
          <input
            id="candidate-context"
            value="Leila Hartmann, VP Product candidate"
            readOnly
            aria-describedby="candidate-context-help"
          />
          <p id="candidate-context-help" className="field-helper">
            Seeded locally for this product demonstration.
          </p>
        </div>

        <div className="field">
          <label htmlFor="conversation-evidence">Conversation evidence</label>
          <textarea
            id="conversation-evidence"
            value={input}
            rows={7}
            onChange={(event) => {
              setInput(event.target.value);
              if (phase === "error") {
                setPhase("idle");
              }
            }}
            aria-invalid={phase === "error"}
            aria-describedby="conversation-evidence-help conversation-evidence-error"
          />
          <p id="conversation-evidence-help" className="field-helper">
            This demo runs deterministic extraction in your browser. It does
            not upload or save the text.
          </p>
          {phase === "error" && (
            <p id="conversation-evidence-error" className="field-error">
              Add a conversation note before analyzing evidence.
            </p>
          )}
        </div>

        <button
          className="button analyze-button"
          type="button"
          onClick={runAnalysis}
          disabled={phase === "loading"}
        >
          {phase === "loading" ? "Analyzing evidence" : "Analyze evidence"}
        </button>
      </section>

      <section
        className="demo-output"
        aria-labelledby="demo-output-title"
        aria-live="polite"
      >
        <div className="demo-output__heading">
          <div>
            <p className="metadata">Review before change</p>
            <h2 id="demo-output-title">Action review</h2>
          </div>
          {phase === "ready" && result && result.actions.length > 0 && (
            <p className="confirmation-count">
              {actionSummary} of {result.actions.length} confirmed
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <WorkbenchSkeleton />
            </motion.div>
          )}

          {(phase === "idle" || phase === "error") && (
            <motion.div
              key="idle"
              className="demo-idle"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p>
                Analyze the note, then review every proposed change with its
                source still attached.
              </p>
            </motion.div>
          )}

          {phase === "ready" && result && result.actions.length === 0 && (
            <motion.div
              key="empty"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <EmptyAnalysis />
            </motion.div>
          )}

          {phase === "ready" && result && result.actions.length > 0 && (
            <motion.div
              key="result"
              className="analysis-result"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="demo-insight">
                <div className="insight-heading">
                  <p>Momentum insight</p>
                  <span className="verdict">{result.insight.verdict}</span>
                </div>
                <p>{result.insight.rationale}</p>
                <p className="next-action">
                  <span>Next action</span>
                  {result.insight.nextAction}
                </p>
              </div>

              <div className="action-list">
                {result.actions.map((action) => {
                  const status = statuses[action.id] ?? "pending";
                  const editing = editingId === action.id;
                  return (
                    <article
                      key={action.id}
                      className="action-card"
                      data-status={status}
                    >
                      <div className="action-card__icon">
                        <ActionIcon type={action.type} />
                      </div>
                      <div className="action-card__content">
                        <div className="action-card__heading">
                          <h3>{action.title}</h3>
                          {status !== "pending" && (
                            <span className="action-status">
                              {status === "confirmed" ? (
                                <CheckCircle aria-hidden="true" size={15} />
                              ) : (
                                <X aria-hidden="true" size={15} />
                              )}
                              {status}
                            </span>
                          )}
                        </div>

                        {editing ? (
                          <div className="inline-edit">
                            <label htmlFor={`edit-${action.id}`}>
                              Proposed update
                            </label>
                            <input
                              id={`edit-${action.id}`}
                              value={edits[action.id] ?? action.detail}
                              onChange={(event) =>
                                setEdits((current) => ({
                                  ...current,
                                  [action.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <p>{edits[action.id] ?? action.detail}</p>
                        )}

                        <p className="evidence-reference">
                          Source:{" "}
                          {
                            result.evidence.find(
                              (item) => item.id === action.evidenceId,
                            )?.label
                          }
                        </p>

                        {status === "pending" ? (
                          <div className="action-card__actions">
                            <button
                              type="button"
                              onClick={() =>
                                editing
                                  ? setEditingId(null)
                                  : setEditingId(action.id)
                              }
                            >
                              <PencilSimple aria-hidden="true" size={15} />
                              {editing ? "Save edit" : "Edit"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateStatus(action.id, "dismissed")
                              }
                            >
                              <X aria-hidden="true" size={15} />
                              Dismiss
                            </button>
                            <button
                              className="confirm-action"
                              type="button"
                              onClick={() =>
                                updateStatus(action.id, "confirmed")
                              }
                            >
                              <Check aria-hidden="true" size={15} />
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button
                            className="restore-action"
                            type="button"
                            onClick={() =>
                              updateStatus(action.id, "pending")
                            }
                          >
                            Restore review
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
