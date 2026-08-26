"use client";

import type {
  KnowledgeSnapshot,
  PersonDirectoryItem,
  PersonMergePreview,
  PersonMergeResponse,
  PersonMergeReversalPreview,
  RelationshipScope,
} from "@talent-signal/contracts";
import {
  AddressBook,
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Prohibit,
  UserPlus,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

export type PersonMergeWorkflowResponse = PersonMergeResponse & {
  compilations: Array<{
    relationship_context_id: string;
    person_id: string;
    status: KnowledgeSnapshot["status"] | "failed";
    knowledge_snapshot_id: string | null;
    error: string | null;
  }>;
};

function formatPersonMergeDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function personMergeDecisionReady({
  blockerCount,
  hasPreview,
  hasSelectedPerson,
  reason,
  reviewed,
}: {
  blockerCount: number;
  hasPreview: boolean;
  hasSelectedPerson: boolean;
  reason: string;
  reviewed: boolean;
}) {
  return (
    hasPreview &&
    hasSelectedPerson &&
    blockerCount === 0 &&
    reviewed &&
    reason.trim().length > 0
  );
}

export function availablePersonMergeReversalOperationId({
  result,
  reversalPreview,
}: {
  result: Pick<PersonMergeWorkflowResponse, "operation_id" | "status"> | null;
  reversalPreview: Pick<
    PersonMergeReversalPreview,
    "operation_id" | "reversal_available"
  > | null;
}) {
  if (result?.status === "applied") {
    return result.operation_id;
  }
  return reversalPreview?.reversal_available
    ? reversalPreview.operation_id
    : null;
}

export function PersonMergeReview({
  currentPerson,
  forceOpen,
  onCloseRequest,
  onMutation,
  reversalPreview,
}: {
  currentPerson: RelationshipScope["person"];
  forceOpen: boolean;
  onCloseRequest: () => void;
  onMutation: (
    response: PersonMergeWorkflowResponse,
    sourceLabel: string,
  ) => void;
  reversalPreview: PersonMergeReversalPreview | null;
}) {
  const mergeRequestRef = useRef<string | null>(null);
  const reversalRequestRef = useRef<string | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PersonDirectoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [preview, setPreview] = useState<PersonMergePreview | null>(null);
  const [result, setResult] =
    useState<PersonMergeWorkflowResponse | null>(null);
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalReviewed, setReversalReviewed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const visible = open || forceOpen;

  useEffect(() => {
    if (!visible || reversalPreview || people.length > 0) {
      return;
    }
    const controller = new AbortController();
    void fetch("/api/local-integration/people", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | { people: PersonDirectoryItem[] }
          | { message?: string };
        if (!response.ok || !("people" in payload)) {
          throw new Error(
            "message" in payload && payload.message
              ? payload.message
              : "People could not be loaded for duplicate review.",
          );
        }
        setPeople(
          payload.people.filter(
            (person) => person.id !== currentPerson.id,
          ),
        );
      })
      .catch((caught: unknown) => {
        if (
          caught instanceof DOMException &&
          caught.name === "AbortError"
        ) {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "People could not be loaded for duplicate review.",
        );
      });
    return () => controller.abort();
  }, [currentPerson.id, people.length, reversalPreview, visible]);

  const matchingPeople = useMemo(() => {
    const normalized = query.normalize("NFKC").trim().toLowerCase();
    return people
      .filter(
        (person) =>
          !normalized ||
          person.display_label
            .normalize("NFKC")
            .toLowerCase()
            .includes(normalized) ||
          person.contexts.some((context) =>
            context.display_label
              .normalize("NFKC")
              .toLowerCase()
              .includes(normalized),
          ),
      )
      .slice(0, 8);
  }, [people, query]);
  const selectedPerson =
    people.find((person) => person.id === selectedPersonId) ?? null;
  const compilationFailures =
    result?.compilations.filter(
      (compilation) => compilation.status === "failed",
    ) ?? [];

  async function searchPeople(value: string) {
    setQuery(value);
    const normalized = value.normalize("NFKC").trim();
    if (normalized.length < 2) {
      return;
    }
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    try {
      const response = await fetch(
        "/api/local-integration/people/search",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: normalized }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json()) as
        | { people: PersonDirectoryItem[] }
        | { message?: string };
      if (!response.ok || !("people" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The people directory search could not be completed.",
        );
      }
      setPeople(
        payload.people.filter(
          (person) => person.id !== currentPerson.id,
        ),
      );
    } catch (caught) {
      if (
        caught instanceof DOMException &&
        caught.name === "AbortError"
      ) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "The people directory search could not be completed.",
      );
    }
  }

  async function choosePerson(person: PersonDirectoryItem) {
    setSelectedPersonId(person.id);
    setPreview(null);
    setResult(null);
    setReason("");
    setReviewed(false);
    setError("");
    mergeRequestRef.current = null;
    setBusy("Comparing evidence");
    try {
      const parameters = new URLSearchParams({
        source_person_id: person.id,
        target_person_id: currentPerson.id,
      });
      const response = await fetch(
        `/api/local-integration/person-merges?${parameters.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | PersonMergePreview
        | { message?: string };
      if (!response.ok || !("preview_digest" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The duplicate review could not be prepared.",
        );
      }
      setPreview(payload);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The duplicate review could not be prepared.",
      );
    } finally {
      setBusy("");
    }
  }

  async function applyMerge() {
    if (
      !preview ||
      !selectedPerson ||
      !personMergeDecisionReady({
        blockerCount: preview.blockers.length,
        hasPreview: true,
        hasSelectedPerson: true,
        reason,
        reviewed,
      })
    ) {
      setError(
        "Review the evidence differences and record why these pages represent one person.",
      );
      return;
    }
    mergeRequestRef.current ??= crypto.randomUUID();
    setBusy("Merging people");
    setError("");
    try {
      const response = await fetch(
        "/api/local-integration/person-merges",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: mergeRequestRef.current,
            source_person_id: preview.source_person.id,
            target_person_id: preview.target_person.id,
            expected_source_version: preview.source_person.version,
            expected_target_version: preview.target_person.version,
            expected_preview_digest: preview.preview_digest,
            decision: "merge_people",
            reason: reason.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | PersonMergeWorkflowResponse
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The person merge was not applied.",
        );
      }
      setResult(payload);
      onMutation(payload, selectedPerson.display_label);
    } catch (caught) {
      mergeRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "The person merge was not applied.",
      );
    } finally {
      setBusy("");
    }
  }

  async function reverseMerge() {
    const operationId = availablePersonMergeReversalOperationId({
      result,
      reversalPreview,
    });
    if (
      !operationId ||
      !reversalReviewed ||
      !reversalReason.trim()
    ) {
      setError(
        "Confirm the relationship split and record why the merge should be reversed.",
      );
      return;
    }
    reversalRequestRef.current ??= crypto.randomUUID();
    setBusy("Reversing merge");
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/person-merges/${operationId}/reversal`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: reversalRequestRef.current,
            decision: "reverse_person_merge",
            reason: reversalReason.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | PersonMergeWorkflowResponse
        | { message?: string };
      if (!response.ok || !("operation_id" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The person merge could not be reversed.",
        );
      }
      setResult(payload);
      onMutation(
        payload,
        selectedPerson?.display_label ??
          preview?.source_person.display_label ??
          reversalPreview?.source_person.display_label ??
          "The prior person",
      );
    } catch (caught) {
      reversalRequestRef.current = null;
      setError(
        caught instanceof Error
          ? caught.message
          : "The person merge could not be reversed.",
      );
    } finally {
      setBusy("");
    }
  }

  function closeReview() {
    setOpen(false);
    onCloseRequest();
    searchControllerRef.current?.abort();
    setQuery("");
    setSelectedPersonId("");
    setPreview(null);
    setResult(null);
    setReason("");
    setReviewed(false);
    setReversalReason("");
    setReversalReviewed(false);
    setError("");
    mergeRequestRef.current = null;
    reversalRequestRef.current = null;
  }

  if (!visible) {
    return (
      <section className="context-person-merge context-person-merge--closed">
        <span>
          <UserPlus aria-hidden="true" size={17} />
        </span>
        <p>
          <strong>Possible duplicate?</strong>
          <small>
            Compare identity evidence before combining relationship memory.
          </small>
        </p>
        <button
          className="context-secondary-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          Review duplicate
        </button>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="person-merge-title"
      className="context-person-merge"
      id="person-merge-review"
    >
      <header className="context-person-merge__heading">
        <div>
          <p className="eyebrow">
            {reversalPreview
              ? "IDENTITY RECOVERY"
              : "IDENTITY MAINTENANCE"}
          </p>
          <h2 id="person-merge-title">
            {reversalPreview
              ? "Review a prior person merge"
              : "Review a possible duplicate"}
          </h2>
          {reversalPreview ? (
            <p>
              Recheck the current relationship state before restoring{" "}
              {reversalPreview.source_person.display_label} as a separate
              person. History alone never authorizes the split.
            </p>
          ) : (
            <p>
              Keep {currentPerson.display_label} as the stable page. The
              selected page, its relationship contexts, and governed sources
              move here only after your confirmation.
            </p>
          )}
        </div>
        <button
          aria-label="Close duplicate review"
          className="context-icon-button"
          disabled={Boolean(busy)}
          onClick={closeReview}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </header>

      {!result ? reversalPreview ? (
        <div className="context-person-merge__preview context-person-merge__reversal">
          <div className="context-person-merge__direction">
            <article data-target="true">
              <span>Current retained page</span>
              <strong>
                {reversalPreview.target_person.display_label}
              </strong>
              <small>Current person and old-link destination</small>
            </article>
            <ArrowRight aria-hidden="true" size={19} />
            <article>
              <span>Restore separately</span>
              <strong>
                {reversalPreview.source_person.display_label}
              </strong>
              <small>
                {reversalPreview.contexts_to_restore.length} relationship{" "}
                {reversalPreview.contexts_to_restore.length === 1
                  ? "context"
                  : "contexts"}
              </small>
            </article>
          </div>

          <div className="context-person-merge__inventory">
            <article>
              <span>Relationship ownership to restore</span>
              <ul>
                {reversalPreview.contexts_to_restore.map((context) => (
                  <li key={context.id}>
                    <span>{context.display_label}</span>
                    <small>
                      {context.active_capture_count}{" "}
                      {context.active_capture_count === 1
                        ? "source"
                        : "sources"}{" "}
                      · {context.active_fact_count} confirmed facts
                    </small>
                  </li>
                ))}
              </ul>
            </article>
            <article>
              <span>Original recruiter decision</span>
              <strong>
                Merged {formatPersonMergeDate(reversalPreview.decided_at)}
              </strong>
              <p>{reversalPreview.original_reason}</p>
              <p>
                Operation {reversalPreview.operation_id.slice(0, 8)} ·{" "}
                current status {reversalPreview.status}
              </p>
            </article>
          </div>

          {reversalPreview.blockers.length > 0 ? (
            <div
              className="context-person-merge__blockers"
              role="alert"
            >
              <Warning aria-hidden="true" size={18} />
              <div>
                <strong>Automatic reversal paused</strong>
                {reversalPreview.blockers.map((blocker) => (
                  <p key={blocker.code}>
                    {blocker.message} ({blocker.count})
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="context-person-merge__decision">
              <label htmlFor="person-merge-history-reversal-reason">
                Why should these people be separate now?
              </label>
              <textarea
                id="person-merge-history-reversal-reason"
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  reversalRequestRef.current = null;
                }}
                placeholder="Record the recruiter-observed correction basis."
                rows={3}
                value={reversalReason}
              />
              <label className="context-person-merge__check">
                <input
                  checked={reversalReviewed}
                  onChange={(event) =>
                    setReversalReviewed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I reviewed the current relationship ownership and the
                  original merge basis. Restore{" "}
                  {reversalPreview.source_person.display_label} only as the
                  separate person recorded by this operation.
                </span>
              </label>
              <button
                className="context-secondary-button"
                disabled={
                  Boolean(busy) ||
                  !reversalReviewed ||
                  !reversalReason.trim()
                }
                onClick={() => void reverseMerge()}
                type="button"
              >
                {busy === "Reversing merge" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                Restore separate pages
              </button>
              <small>
                This rechecks canonical state at execution time and performs no
                external write.
              </small>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="context-person-merge__picker">
            <label htmlFor="person-merge-query">
              Find the page that may be a duplicate
            </label>
            <input
              autoComplete="off"
              id="person-merge-query"
              onChange={(event) =>
                void searchPeople(event.target.value)
              }
              placeholder="Name or relationship context"
              type="search"
              value={query}
            />
            <div className="context-person-merge__people">
              {matchingPeople.map((person) => (
                <button
                  aria-pressed={selectedPersonId === person.id}
                  data-selected={selectedPersonId === person.id}
                  disabled={Boolean(busy)}
                  key={person.id}
                  onClick={() => void choosePerson(person)}
                  type="button"
                >
                  <span aria-hidden="true">
                    {person.display_label.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <p>
                    <strong>{person.display_label}</strong>
                    <small>
                      {person.context_count} relationship{" "}
                      {person.context_count === 1 ? "context" : "contexts"} ·{" "}
                      {person.capture_count} governed{" "}
                      {person.capture_count === 1 ? "source" : "sources"}
                    </small>
                  </p>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              ))}
              {!busy && matchingPeople.length === 0 ? (
                <p>No other active person pages match this search.</p>
              ) : null}
            </div>
          </div>

          {preview ? (
            <div className="context-person-merge__preview">
              <div className="context-person-merge__direction">
                <article>
                  <span>Fold in</span>
                  <strong>{preview.source_person.display_label}</strong>
                  <small>
                    {preview.contexts_to_move.length} relationship{" "}
                    {preview.contexts_to_move.length === 1
                      ? "context"
                      : "contexts"}
                  </small>
                </article>
                <ArrowRight aria-hidden="true" size={19} />
                <article data-target="true">
                  <span>Retain</span>
                  <strong>{preview.target_person.display_label}</strong>
                  <small>URL and person identity stay stable</small>
                </article>
              </div>

              <div className="context-person-merge__inventory">
                <article>
                  <span>Relationship memory moving</span>
                  <strong>
                    {preview.active_capture_count} governed sources ·{" "}
                    {preview.active_identity_handle_count} identity clues
                  </strong>
                  <ul>
                    {preview.contexts_to_move.map((context) => (
                      <li key={context.id}>
                        <span>{context.display_label}</span>
                        <small>
                          {context.active_capture_count}{" "}
                          {context.active_capture_count === 1
                            ? "source"
                            : "sources"}{" "}
                          ·{" "}
                          {context.active_fact_count} confirmed facts
                        </small>
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Differences to review</span>
                  {preview.review_items.length > 0 ? (
                    <ul>
                      {preview.review_items.map((item, index) => (
                        <li key={`${item.kind}:${index}`}>
                          <span>{item.title}</span>
                          <small>
                            {item.detail} · {item.evidence_ids.length} evidence{" "}
                            {item.evidence_ids.length === 1
                              ? "reference"
                              : "references"}
                          </small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No conflicting labels, contextual facts, or confirmed
                      identity clues were found.
                    </p>
                  )}
                </article>
              </div>

              {preview.blockers.length > 0 ? (
                <div
                  className="context-person-merge__blockers"
                  role="alert"
                >
                  <Warning aria-hidden="true" size={18} />
                  <div>
                    <strong>Merge paused</strong>
                    {preview.blockers.map((blocker) => (
                      <p key={blocker.code}>
                        {blocker.message} ({blocker.count})
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="context-person-merge__decision">
                  <label htmlFor="person-merge-reason">
                    Why do these pages represent one person?
                  </label>
                  <textarea
                    id="person-merge-reason"
                    onChange={(event) => {
                      setReason(event.target.value);
                      mergeRequestRef.current = null;
                    }}
                    placeholder="Record the recruiter-observed identity basis."
                    rows={3}
                    value={reason}
                  />
                  <label className="context-person-merge__check">
                    <input
                      checked={reviewed}
                      onChange={(event) =>
                        setReviewed(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      I reviewed the labels, relationship contexts, source
                      counts, and identity differences above. Keep{" "}
                      {currentPerson.display_label} as the stable page.
                    </span>
                  </label>
                  <button
                    className="context-primary-button"
                    disabled={
                      Boolean(busy) || !reviewed || !reason.trim()
                    }
                    onClick={() => void applyMerge()}
                    type="button"
                  >
                    {busy === "Merging people" ? (
                      <CircleNotch
                        aria-hidden="true"
                        className="context-spin"
                        size={17}
                      />
                    ) : (
                      <UserPlus aria-hidden="true" size={17} />
                    )}
                    Merge into {currentPerson.display_label}
                  </button>
                  <small>
                    This changes internal identity and Wiki memory only. It
                    sends no message and performs no external write.
                  </small>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <div className="context-person-merge__receipt">
          <div data-status={result.status}>
            {result.status === "applied" ? (
              <CheckCircle aria-hidden="true" size={22} weight="fill" />
            ) : (
              <AddressBook aria-hidden="true" size={22} />
            )}
            <p>
              <strong>
                {result.status === "applied"
                  ? "One living person page retained"
                  : "Separate person pages restored"}
              </strong>
              <small>
                Operation {result.operation_id.slice(0, 8)} ·{" "}
                {result.affected_relationship_context_ids.length} contexts ·{" "}
                {result.captures_rebound} governed sources
              </small>
            </p>
          </div>
          <p>
            {result.compilations.length - compilationFailures.length} of{" "}
            {result.compilations.length} relationship Wikis recompiled
            successfully.
            {compilationFailures.length > 0
              ? ` ${compilationFailures.length} need a safe retry; source ownership is already preserved.`
              : ""}
          </p>

          {result.status === "applied" && result.reversal_available ? (
            <details>
              <summary>Undo this merge</summary>
              <p>
                Reversal restores the prior person and relationship ownership.
                It stops if new evidence now depends on a moved context.
              </p>
              <label htmlFor="person-merge-reversal-reason">
                Why should these people be separate?
              </label>
              <textarea
                id="person-merge-reversal-reason"
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  reversalRequestRef.current = null;
                }}
                rows={3}
                value={reversalReason}
              />
              <label className="context-person-merge__check">
                <input
                  checked={reversalReviewed}
                  onChange={(event) =>
                    setReversalReviewed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I reviewed the split and understand that the earlier person
                  page and its relationship contexts will return.
                </span>
              </label>
              <button
                className="context-secondary-button"
                disabled={
                  Boolean(busy) ||
                  !reversalReviewed ||
                  !reversalReason.trim()
                }
                onClick={() => void reverseMerge()}
                type="button"
              >
                {busy === "Reversing merge" ? (
                  <CircleNotch
                    aria-hidden="true"
                    className="context-spin"
                    size={17}
                  />
                ) : (
                  <Prohibit aria-hidden="true" size={17} />
                )}
                Restore separate pages
              </button>
            </details>
          ) : (
            <button
              className="context-secondary-button"
              onClick={closeReview}
              type="button"
            >
              Done
            </button>
          )}
        </div>
      )}

      {busy && busy !== "Merging people" && busy !== "Reversing merge" ? (
        <p className="context-person-merge__progress" role="status">
          <CircleNotch
            aria-hidden="true"
            className="context-spin"
            size={15}
          />
          {busy}
        </p>
      ) : null}
      {error ? (
        <p className="context-person-merge__error" role="alert">
          <Warning aria-hidden="true" size={15} />
          {error}
        </p>
      ) : null}
    </section>
  );
}
