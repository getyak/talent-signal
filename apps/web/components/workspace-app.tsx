"use client";

import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CheckCircle,
  Clock,
  Database,
  FloppyDisk,
  LockKey,
  NotePencil,
  PencilSimple,
  Prohibit,
  Question,
  SignOut,
  Warning,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { signOutOfWorkspace } from "@/app/login/actions";
import {
  getCaseEvidence,
  getCaseIdentityLabel,
  getDispositionLabel,
  getFieldLabel,
  type CandidateMomentumCase,
  type CandidateMomentumDataset,
  type WorkspaceDataSource,
} from "@/lib/candidateMomentum";
import {
  canApproveAction,
  createCaseReview,
  getCaseProgress,
  hasUnresolvedIdentity,
  hasUnresolvedTime,
  isFactReviewComplete,
  type CaseReview,
  type FactReviewStatus,
  type OutcomeStatus,
} from "@/lib/reviewState";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

function initialsForUser(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "TS";
  return source
    .split(/[\s._-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getInitialReviews(dataset: CandidateMomentumDataset) {
  return Object.fromEntries(
    dataset.cases.map((fixtureCase) => [
      fixtureCase.id,
      createCaseReview(fixtureCase),
    ]),
  ) as Record<CandidateMomentumCase["id"], CaseReview>;
}

function readableCandidateOption(value: string) {
  return value.replace(" — ", ", ");
}

function getSourceState(source: WorkspaceDataSource) {
  if (source.kind === "synchronized-local") {
    return "synchronized";
  }
  if (source.kind === "fixture-local") {
    return "local fixture";
  }
  return "sample only";
}

function getAttentionCopy(
  fixtureCase: CandidateMomentumCase,
  review: CaseReview,
) {
  if (hasUnresolvedIdentity(fixtureCase, review)) {
    return {
      label: "Resolve identity",
      title: "Choose the assignment context before reviewing any fact.",
      detail:
        "The source names Alex Chen, but it does not contain enough binding evidence for either record.",
    };
  }
  if (hasUnresolvedTime(fixtureCase, review)) {
    return {
      label: "Resolve source time",
      title: "Keep the relative date unresolved until its timezone is known.",
      detail:
        "The capture happened two days later and the source timezone is missing.",
    };
  }
  if (fixtureCase.expected.disposition === "block") {
    return {
      label: "Boundary applied",
      title: "Do not turn conversational tone into a candidate score.",
      detail:
        "The requested output is outside the product boundary, so no assertion or action is created.",
    };
  }
  if (fixtureCase.expected.disposition === "no_action") {
    return {
      label: "No action is valid",
      title:
        fixtureCase.expected.assertions.length > 0
          ? "Review the third-party statement without manufacturing follow-up."
          : "Keep the conversation as context and create no task.",
      detail:
        fixtureCase.expected.assertions.length > 0
          ? "The source can support one attributed proposal, but it does not support candidate agreement."
          : "No decision-relevant change, commitment, or dependency is present.",
    };
  }
  if (!isFactReviewComplete(fixtureCase, review)) {
    return {
      label: "Review proposed state",
      title: `${fixtureCase.expected.assertions.length} source-linked ${
        fixtureCase.expected.assertions.length === 1 ? "fact needs" : "facts need"
      } an individual decision.`,
      detail:
        "Confirm, edit, or dismiss each proposal. Fact review does not approve the next action.",
    };
  }
  return {
    label: "Decide on one action",
    title: "The reviewed facts support one smallest safe next step.",
    detail:
      "Inspect the exact target and local effect before making a separate approval decision.",
  };
}

function statusLabel(status: FactReviewStatus) {
  const labels: Record<FactReviewStatus, string> = {
    ambiguous: "Ambiguous",
    confirmed: "Confirmed",
    dismissed: "Dismissed",
    edited: "Edited",
    proposed: "Proposed",
    superseded: "Supersession proposed",
  };
  return labels[status];
}

function OutcomeIcon({ status }: { status: OutcomeStatus }) {
  if (status === "verified") {
    return <CheckCircle aria-hidden="true" size={18} />;
  }
  if (status === "failed") {
    return <Warning aria-hidden="true" size={18} />;
  }
  if (status === "unknown") {
    return <Question aria-hidden="true" size={18} />;
  }
  return <Clock aria-hidden="true" size={18} />;
}

function outcomeCopy(status: OutcomeStatus) {
  const copy: Record<OutcomeStatus, { label: string; detail: string }> = {
    failed: {
      label: "Failed",
      detail:
        "The fixture handoff failed. The approved proposal is retained and can be retried.",
    },
    pending: {
      label: "Pending",
      detail:
        "The proposal is approved locally, but no destination observation has been received.",
    },
    unknown: {
      label: "Unknown",
      detail:
        "No observation returned. Treat the effect as unknown until it is reconciled.",
    },
    verified: {
      label: "Verified in fixture",
      detail:
        "The local fixture handoff was observed. No message, meeting, contact, or ATS record was changed.",
    },
  };
  return copy[status];
}

function CaseRailItem({
  fixtureCase,
  onSelect,
  review,
  selected,
}: {
  fixtureCase: CandidateMomentumCase;
  onSelect: () => void;
  review: CaseReview;
  selected: boolean;
}) {
  const progress = getCaseProgress(fixtureCase, review);
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "page" : undefined}
        onClick={onSelect}
      >
        <span className="review-case-rail__meta">
          <strong>{fixtureCase.id}</strong>
          <small>{getDispositionLabel(fixtureCase.expected.disposition)}</small>
        </span>
        <span className="review-case-rail__title">
          {getCaseIdentityLabel(fixtureCase)}
        </span>
        <span className="review-case-rail__progress">
          {progress.total > 0
            ? `${progress.completed} of ${progress.total} review decisions`
            : "No fact review required"}
        </span>
      </button>
    </li>
  );
}

export function WorkspaceApp({
  dataset,
  source,
  user,
}: {
  dataset: CandidateMomentumDataset;
  source: WorkspaceDataSource;
  user: { email?: string | null; name?: string | null };
}) {
  const [selectedId, setSelectedId] =
    useState<CandidateMomentumCase["id"]>("TS-CORE-01");
  const [reviews, setReviews] = useState(() => getInitialReviews(dataset));
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState({
    date: "",
    time: "15:00",
    timezone: "",
  });
  const [timeError, setTimeError] = useState("");
  const [outcomeDraft, setOutcomeDraft] =
    useState<OutcomeStatus>("pending");
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

  const fixtureCase =
    dataset.cases.find((item) => item.id === selectedId) ?? dataset.cases[0];
  const review = reviews[fixtureCase.id];
  const attention = getAttentionCopy(fixtureCase, review);
  const progress = getCaseProgress(fixtureCase, review);

  const selectedIndex = useMemo(
    () => dataset.cases.findIndex((item) => item.id === fixtureCase.id),
    [dataset.cases, fixtureCase.id],
  );

  function updateReview(transform: (current: CaseReview) => CaseReview) {
    setReviews((current) => ({
      ...current,
      [fixtureCase.id]: transform(current[fixtureCase.id]),
    }));
  }

  function selectCase(nextId: CandidateMomentumCase["id"]) {
    setSelectedId(nextId);
    setEditingField(null);
    setTimeError("");
    setOutcomeDraft("pending");
    window.requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }

  function setFactStatus(field: string, status: FactReviewStatus) {
    updateReview((current) => ({
      ...current,
      factReviews: {
        ...current.factReviews,
        [field]: {
          ...current.factReviews[field],
          status,
        },
      },
    }));
    setEditingField(null);
  }

  function saveFactEdit(field: string) {
    const value = editDraft.trim();
    if (!value) {
      return;
    }
    updateReview((current) => ({
      ...current,
      factReviews: {
        ...current.factReviews,
        [field]: {
          ...current.factReviews[field],
          status: "edited",
          value,
        },
      },
    }));
    setEditingField(null);
  }

  function resolveTime() {
    if (!timeDraft.date || !timeDraft.time || !timeDraft.timezone) {
      setTimeError("Choose an exact date, local time, and source timezone.");
      return;
    }
    updateReview((current) => ({
      ...current,
      timeResolution: timeDraft,
      factReviews: {
        ...current.factReviews,
        availability: {
          ...current.factReviews.availability,
          status: "edited",
          value: `${timeDraft.date} at ${timeDraft.time} (${timeDraft.timezone})`,
        },
      },
    }));
    setTimeError("");
  }

  function resetSelectedCase() {
    setReviews((current) => ({
      ...current,
      [fixtureCase.id]: createCaseReview(fixtureCase),
    }));
    setEditingField(null);
    setEditDraft("");
    setTimeDraft({ date: "", time: "15:00", timezone: "" });
    setTimeError("");
    setOutcomeDraft("pending");
  }

  const timeIsUnresolved = hasUnresolvedTime(fixtureCase, review);
  const identityIsUnresolved = hasUnresolvedIdentity(fixtureCase, review);
  const currentOutcome = outcomeCopy(review.outcome);

  return (
    <div className="review-workspace">
      <aside className="review-sidebar">
        <div className="review-sidebar__brand">
          <BrandMark compact />
          <span>Talent Signal</span>
        </div>

        <div className="review-sidebar__scope">
          <p>Evidence review</p>
          <span>Eight synthetic cases</span>
        </div>

        <nav aria-label="Candidate momentum fixture cases">
          <ol className="review-case-rail">
            {dataset.cases.map((item) => (
              <CaseRailItem
                fixtureCase={item}
                key={item.id}
                selected={item.id === fixtureCase.id}
                review={reviews[item.id]}
                onSelect={() => selectCase(item.id)}
              />
            ))}
          </ol>
        </nav>

        <div className="review-sidebar__foot">
          <Link href="/">
            <ArrowSquareOut aria-hidden="true" size={16} />
            Product site
          </Link>
          <form action={signOutOfWorkspace}>
            <button type="submit">
              <SignOut aria-hidden="true" size={16} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="review-stage">
        <header className="review-topbar">
          <div className="review-topbar__source" data-source={source.kind}>
            <Database aria-hidden="true" size={16} />
            <span>
              <strong>{source.label}</strong>
              <small>{getSourceState(source)}</small>
            </span>
          </div>
          <div className="review-user">
            <ThemeToggle />
            <span>{initialsForUser(user.name, user.email)}</span>
            <div>
              <strong>{user.name ?? "Recruiter"}</strong>
              <small>{user.email ?? "Signed in"}</small>
            </div>
          </div>
        </header>

        <main id="main-content" className="review-main">
          <section
            className="review-source-note"
            aria-label="Workspace data source"
          >
            <strong>{source.label}</strong>
            <p>{source.detail}</p>
            <button type="button" onClick={() => window.location.reload()}>
              <ArrowCounterClockwise aria-hidden="true" size={15} />
              Refresh source
            </button>
          </section>

          <div className="review-mobile-picker">
            <label htmlFor="fixture-case">Review case</label>
            <select
              id="fixture-case"
              value={fixtureCase.id}
              onChange={(event) =>
                selectCase(
                  event.target.value as CandidateMomentumCase["id"],
                )
              }
            >
              {dataset.cases.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.id}: {getCaseIdentityLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <header className="review-case-header">
            <div>
              <p>
                <span>{fixtureCase.id}</span>
                <span>{getDispositionLabel(fixtureCase.expected.disposition)}</span>
              </p>
              <h1 ref={reviewHeadingRef} tabIndex={-1}>
                {getCaseIdentityLabel(fixtureCase)}
              </h1>
              <span>
                {fixtureCase.context.assignment ?? "Assignment unresolved"}
              </span>
            </div>
            <div className="review-case-header__position">
              <span>
                Case {selectedIndex + 1} of {dataset.cases.length}
              </span>
              <small>
                {progress.total > 0
                  ? `${progress.completed} of ${progress.total} decisions complete`
                  : "No fact decisions required"}
              </small>
              <button type="button" onClick={resetSelectedCase}>
                <ArrowCounterClockwise aria-hidden="true" size={15} />
                Reset case
              </button>
            </div>
          </header>

          <section
            className="review-attention"
            aria-labelledby="current-dependency"
          >
            <p>{attention.label}</p>
            <h2 id="current-dependency">{attention.title}</h2>
            <span>{attention.detail}</span>
          </section>

          <div className="review-columns">
            <div className="review-evidence-column">
              <section
                className="review-section review-source"
                aria-labelledby="source-evidence-title"
              >
                <header>
                  <div>
                    <p>Observed evidence</p>
                    <h2 id="source-evidence-title">Exact source</h2>
                  </div>
                  <span>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone:
                        fixtureCase.context.source_timezone ??
                        "Asia/Singapore",
                    }).format(
                      new Date(fixtureCase.context.captured_at),
                    )}
                  </span>
                </header>

                <div className="review-transcript">
                  {fixtureCase.messages.map((message) => (
                    <article key={message.id}>
                      <div>
                        <strong>{message.speaker}</strong>
                        <small>{message.id}</small>
                      </div>
                      <blockquote>{message.text}</blockquote>
                    </article>
                  ))}
                </div>

                <dl className="review-source-metadata">
                  <div>
                    <dt>Source timezone</dt>
                    <dd>
                      {fixtureCase.context.source_timezone ?? "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt>Assignment</dt>
                    <dd>
                      {fixtureCase.context.assignment ?? "Not yet bound"}
                    </dd>
                  </div>
                </dl>
              </section>

              {identityIsUnresolved && (
                <section
                  className="review-section ambiguity-panel"
                  aria-labelledby="identity-resolution-title"
                >
                  <header>
                    <div>
                      <p>Identity ambiguity</p>
                      <h2 id="identity-resolution-title">
                        Which Alex Chen does this source belong to?
                      </h2>
                    </div>
                    <LockKey aria-hidden="true" size={20} />
                  </header>
                  <p>
                    No candidate fact or deadline action can be created until
                    you choose a context. This choice stays in the fixture
                    session.
                  </p>
                  <fieldset>
                    <legend>Candidate and assignment</legend>
                    {fixtureCase.context.candidate_options?.map((option) => (
                      <label key={option}>
                        <input
                          type="radio"
                          name={`identity-${fixtureCase.id}`}
                          value={option}
                          checked={review.identityResolution === option}
                          onChange={() =>
                            updateReview((current) => ({
                              ...current,
                              identityResolution: option,
                            }))
                          }
                        />
                        <span>{readableCandidateOption(option)}</span>
                      </label>
                    ))}
                  </fieldset>
                </section>
              )}

              {!identityIsUnresolved &&
                fixtureCase.context.candidate_options?.length && (
                  <section className="resolution-note" aria-live="polite">
                    <CheckCircle aria-hidden="true" size={18} />
                    <div>
                      <strong>Context selected</strong>
                      <p>
                        {readableCandidateOption(
                          review.identityResolution ?? "",
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateReview((current) => ({
                          ...current,
                          identityResolution: null,
                        }))
                      }
                    >
                      Change
                    </button>
                  </section>
                )}

              {timeIsUnresolved && (
                <section
                  className="review-section ambiguity-panel"
                  aria-labelledby="time-resolution-title"
                >
                  <header>
                    <div>
                      <p>Time ambiguity</p>
                      <h2 id="time-resolution-title">
                        Resolve the source date and timezone.
                      </h2>
                    </div>
                    <Clock aria-hidden="true" size={20} />
                  </header>
                  <p>{fixtureCase.context.notes}</p>
                  <div className="time-resolution-fields">
                    <label>
                      <span>Exact date</span>
                      <input
                        type="date"
                        value={timeDraft.date}
                        onChange={(event) =>
                          setTimeDraft((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Local time</span>
                      <input
                        type="time"
                        value={timeDraft.time}
                        onChange={(event) =>
                          setTimeDraft((current) => ({
                            ...current,
                            time: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Source timezone</span>
                      <select
                        value={timeDraft.timezone}
                        onChange={(event) =>
                          setTimeDraft((current) => ({
                            ...current,
                            timezone: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose timezone</option>
                        <option value="Asia/Singapore">
                          Asia/Singapore
                        </option>
                        <option value="Europe/London">Europe/London</option>
                      </select>
                    </label>
                  </div>
                  {timeError && (
                    <p className="review-inline-error" role="alert">
                      {timeError}
                    </p>
                  )}
                  <button
                    className="review-primary-button"
                    type="button"
                    onClick={resolveTime}
                  >
                    <Check aria-hidden="true" size={16} />
                    Use this source time
                  </button>
                </section>
              )}

              {!timeIsUnresolved && review.timeResolution && (
                <section className="resolution-note" aria-live="polite">
                  <CheckCircle aria-hidden="true" size={18} />
                  <div>
                    <strong>Source time resolved</strong>
                    <p>
                      {review.timeResolution.date} at{" "}
                      {review.timeResolution.time} (
                      {review.timeResolution.timezone})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateReview((current) => ({
                        ...current,
                        timeResolution: null,
                        factReviews: {
                          ...current.factReviews,
                          availability: {
                            ...current.factReviews.availability,
                            status: "ambiguous",
                            value:
                              current.factReviews.availability.originalValue,
                          },
                        },
                      }))
                    }
                  >
                    Change
                  </button>
                </section>
              )}
            </div>

            <div className="review-decision-column">
              <section
                className="review-section review-facts"
                aria-labelledby="proposed-state-title"
              >
                <header>
                  <div>
                    <p>Proposed understanding</p>
                    <h2 id="proposed-state-title">Review each fact</h2>
                  </div>
                  <span>
                    {fixtureCase.expected.assertions.length}{" "}
                    {fixtureCase.expected.assertions.length === 1
                      ? "proposal"
                      : "proposals"}
                  </span>
                </header>

                {fixtureCase.expected.assertions.length === 0 ? (
                  <div className="review-empty-state">
                    {fixtureCase.expected.disposition === "block" ? (
                      <Prohibit aria-hidden="true" size={23} />
                    ) : (
                      <NotePencil aria-hidden="true" size={23} />
                    )}
                    <h3>
                      {fixtureCase.expected.disposition === "block"
                        ? "Unsupported request blocked"
                        : "No fact change proposed"}
                    </h3>
                    <p>
                      {fixtureCase.expected.disposition === "block"
                        ? "Tone, response speed, and shared interests are not used to score candidate fit or quality."
                        : "The conversation remains available as source context, but it does not support a new candidate fact."}
                    </p>
                  </div>
                ) : (
                  <div className="fact-review-list">
                    {fixtureCase.expected.assertions.map((assertion) => {
                      const factReview =
                        review.factReviews[assertion.field];
                      const evidence = getCaseEvidence(
                        fixtureCase,
                        assertion.evidence_message_id,
                      );
                      const editing = editingField === assertion.field;
                      const priorValue =
                        fixtureCase.context.prior_state?.[assertion.field];
                      const ambiguousFactLocked =
                        assertion.status === "ambiguous" &&
                        !review.timeResolution;

                      return (
                        <article
                          key={assertion.field}
                          className="fact-review"
                          data-state={factReview.status}
                        >
                          <div className="fact-review__heading">
                            <div>
                              <span>{getFieldLabel(assertion.field)}</span>
                              <small data-state={factReview.status}>
                                {statusLabel(factReview.status)}
                              </small>
                            </div>
                            {priorValue && (
                              <p>
                                <span>Before</span>
                                <del>{priorValue}</del>
                              </p>
                            )}
                          </div>

                          {editing ? (
                            <div className="fact-review__edit">
                              <label htmlFor={`edit-${assertion.field}`}>
                                Edited value
                              </label>
                              <textarea
                                id={`edit-${assertion.field}`}
                                rows={3}
                                value={editDraft}
                                onChange={(event) =>
                                  setEditDraft(event.target.value)
                                }
                              />
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setEditingField(null)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    saveFactEdit(assertion.field)
                                  }
                                >
                                  <FloppyDisk
                                    aria-hidden="true"
                                    size={15}
                                  />
                                  Save edit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="fact-review__value">
                                {factReview.status === "edited" && (
                                  <p>
                                    <span>Proposed</span>
                                    <del>{factReview.originalValue}</del>
                                  </p>
                                )}
                                <p>
                                  <span>
                                    {factReview.status === "edited"
                                      ? "After"
                                      : "Value"}
                                  </span>
                                  <strong>{factReview.value}</strong>
                                </p>
                              </div>
                              <div className="fact-review__evidence">
                                <span>
                                  Exact evidence, {evidence?.speaker}
                                </span>
                                <blockquote>
                                  “{assertion.evidence_quote}”
                                </blockquote>
                              </div>
                            </>
                          )}

                          {!editing &&
                            (factReview.status === "confirmed" ||
                            factReview.status === "dismissed" ||
                            factReview.status === "edited" ? (
                              <button
                                className="fact-review__restore"
                                type="button"
                                onClick={() =>
                                  setFactStatus(
                                    assertion.field,
                                    assertion.status,
                                  )
                                }
                              >
                                Reopen review
                              </button>
                            ) : (
                              <div className="fact-review__actions">
                                <button
                                  type="button"
                                  disabled={ambiguousFactLocked}
                                  onClick={() => {
                                    setEditDraft(factReview.value);
                                    setEditingField(assertion.field);
                                  }}
                                >
                                  <PencilSimple
                                    aria-hidden="true"
                                    size={15}
                                  />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFactStatus(
                                      assertion.field,
                                      "dismissed",
                                    )
                                  }
                                >
                                  <X aria-hidden="true" size={15} />
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  disabled={ambiguousFactLocked}
                                  onClick={() =>
                                    setFactStatus(
                                      assertion.field,
                                      "confirmed",
                                    )
                                  }
                                >
                                  <Check aria-hidden="true" size={15} />
                                  Confirm
                                </button>
                              </div>
                            ))}
                          {ambiguousFactLocked && (
                            <p className="fact-review__locked">
                              Resolve the source time before confirming or
                              editing this value.
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section
                className="review-section review-action"
                aria-labelledby="action-review-title"
              >
                <header>
                  <div>
                    <p>Independent decision</p>
                    <h2 id="action-review-title">One next action</h2>
                  </div>
                  {fixtureCase.expected.action && (
                    <span>Separate approval</span>
                  )}
                </header>

                {!fixtureCase.expected.action ? (
                  <div className="review-empty-state review-empty-state--action">
                    {fixtureCase.expected.disposition === "clarify" ? (
                      <LockKey aria-hidden="true" size={23} />
                    ) : fixtureCase.expected.disposition === "block" ? (
                      <Prohibit aria-hidden="true" size={23} />
                    ) : (
                      <CheckCircle aria-hidden="true" size={23} />
                    )}
                    <h3>
                      {fixtureCase.expected.disposition === "clarify"
                        ? "Clarification only"
                        : fixtureCase.expected.disposition === "block"
                          ? "No action allowed"
                          : "No action is the reviewed result"}
                    </h3>
                    <p>
                      {fixtureCase.expected.disposition === "clarify"
                        ? "Resolve the ambiguity without creating a meeting, deadline action, or candidate fact."
                        : fixtureCase.expected.disposition === "block"
                          ? "The unsupported scoring request cannot create a candidate assessment or follow-up."
                          : "This case does not manufacture urgency, sentiment, agreement, or a follow-up task."}
                    </p>
                  </div>
                ) : (
                  <div
                    className="action-proposal"
                    data-state={review.actionDecision}
                  >
                    <div className="action-proposal__title">
                      <span>Prepare question</span>
                      <h3>{fixtureCase.expected.action.target}</h3>
                    </div>
                    <dl>
                      <div>
                        <dt>Why now</dt>
                        <dd>{fixtureCase.expected.action.reason}</dd>
                      </div>
                      <div>
                        <dt>Owner</dt>
                        <dd>{fixtureCase.expected.action.owner}</dd>
                      </div>
                      <div>
                        <dt>Due</dt>
                        <dd>{fixtureCase.expected.action.due}</dd>
                      </div>
                      <div>
                        <dt>Exact local effect</dt>
                        <dd>
                          Add one approved question to this fixture session.
                          Nothing is sent or scheduled.
                        </dd>
                      </div>
                    </dl>

                    <div className="action-proposal__evidence">
                      <span>Supporting source</span>
                      {fixtureCase.expected.action.evidence_message_ids.map(
                        (messageId) => (
                          <blockquote key={messageId}>
                            “
                            {
                              getCaseEvidence(fixtureCase, messageId)?.text
                            }
                            ”
                          </blockquote>
                        ),
                      )}
                    </div>

                    {review.actionDecision === "pending" && (
                      <>
                        {!canApproveAction(fixtureCase, review) && (
                          <p className="action-proposal__locked">
                            <LockKey aria-hidden="true" size={15} />
                            Review every proposed fact before this separate
                            decision becomes available.
                          </p>
                        )}
                        <div className="action-proposal__actions">
                          <button
                            type="button"
                            disabled={
                              !isFactReviewComplete(fixtureCase, review)
                            }
                            onClick={() =>
                              updateReview((current) => ({
                                ...current,
                                actionDecision: "declined",
                              }))
                            }
                          >
                            Decline action
                          </button>
                          <button
                            className="review-primary-button"
                            type="button"
                            disabled={
                              !canApproveAction(fixtureCase, review)
                            }
                            onClick={() =>
                              updateReview((current) => ({
                                ...current,
                                actionDecision: "approved",
                                outcome: "pending",
                              }))
                            }
                          >
                            <Check aria-hidden="true" size={16} />
                            Approve local handoff
                          </button>
                        </div>
                      </>
                    )}

                    {review.actionDecision === "declined" && (
                      <div className="action-decision-note">
                        <Prohibit aria-hidden="true" size={18} />
                        <div>
                          <strong>Action declined</strong>
                          <p>
                            The evidence and reviewed facts remain intact. No
                            local handoff was created.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateReview((current) => ({
                              ...current,
                              actionDecision: "pending",
                            }))
                          }
                        >
                          Restore proposal
                        </button>
                      </div>
                    )}

                    {review.actionDecision === "approved" && (
                      <div className="fixture-outcome">
                        <div
                          className="fixture-outcome__state"
                          data-outcome={review.outcome}
                          aria-live="polite"
                        >
                          <OutcomeIcon status={review.outcome} />
                          <div>
                            <strong>{currentOutcome.label}</strong>
                            <p>{currentOutcome.detail}</p>
                          </div>
                        </div>
                        <div className="fixture-outcome__control">
                          <label htmlFor={`outcome-${fixtureCase.id}`}>
                            Fixture observation to inspect
                          </label>
                          <div>
                            <select
                              id={`outcome-${fixtureCase.id}`}
                              value={outcomeDraft}
                              onChange={(event) =>
                                setOutcomeDraft(
                                  event.target.value as OutcomeStatus,
                                )
                              }
                            >
                              <option value="pending">Pending</option>
                              <option value="verified">
                                Verified in fixture
                              </option>
                              <option value="failed">Failed</option>
                              <option value="unknown">Unknown</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                updateReview((current) => ({
                                  ...current,
                                  outcome: outcomeDraft,
                                }))
                              }
                            >
                              Apply fixture result
                            </button>
                          </div>
                          <p>
                            This control demonstrates outcome semantics. It
                            does not contact or observe an external system.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <details className="review-boundaries">
                <summary>Case boundaries preserved</summary>
                <ul>
                  {fixtureCase.expected.must_not.map((boundary) => (
                    <li key={boundary}>{boundary}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
