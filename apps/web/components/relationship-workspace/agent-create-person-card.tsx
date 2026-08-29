"use client";

import {
  maskIdentityHandle,
  parseIdentityHandleQuery,
  type IdentityHandleType,
  type PersonDirectoryItem,
  type RelationshipScope,
  type ResourceCaptureResponse,
} from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Clock,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type AgentPersonTarget,
  agentPersonOutcome,
  agentPersonScopeFields,
  agentRelationshipContexts,
  canCreateDistinctPerson,
  canSelectPersonForIdentityClue,
  confirmedHandlePersonMatches,
  exactPersonNameMatches,
  expiredHandlePersonMatches,
  mergePersonDirectoryMatches,
  personIdentityTemporalRole,
} from "@/lib/agent-person-resolution";
import { relationshipIntegrationFetch } from "@/components/workspace-session-request";
import type { AgentContactDraft } from "@/lib/agent-contact-intake";

function identityHandleLabel(type: IdentityHandleType) {
  switch (type) {
    case "email":
      return "Email";
    case "phone":
      return "Phone";
    case "wechat":
      return "WeChat";
    case "linkedin_url":
      return "LinkedIn";
    case "public_profile_url":
      return "Public profile";
    case "source_native_id":
      return "Source ID";
  }
}
function personInitials(value: string) {
  const segments = value.trim().split(/\s+/);
  if (segments.length === 1) {
    return value.slice(0, 2).toUpperCase();
  }
  return segments
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AgentCreatePersonCard({
  currentPersonId,
  initialDraft,
  onCancel,
  onCommitted,
  onDeferred,
  onReviewDuplicates,
}: {
  currentPersonId?: string;
  initialDraft?: AgentContactDraft | null;
  onCancel: () => void;
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onDeferred: (caseId: string) => void;
  onReviewDuplicates?: () => void;
}) {
  const requestIdRef = useRef<string | null>(null);
  const handleRequestIdRef = useRef<string | null>(null);
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [identityClue, setIdentityClue] = useState(
    initialDraft?.identityClue ?? "",
  );
  const [identityClueConfirmed, setIdentityClueConfirmed] =
    useState(false);
  const [contextLabel, setContextLabel] = useState(
    initialDraft?.relationshipContext ?? "",
  );
  const [firstNote, setFirstNote] = useState(
    initialDraft?.sourceNote ?? "",
  );
  const [matches, setMatches] = useState<PersonDirectoryItem[]>([]);
  const [lookupState, setLookupState] = useState<
    "error" | "idle" | "loading" | "ready"
  >(initialDraft?.name || initialDraft?.identityClue ? "loading" : "idle");
  const [lookupRevision, setLookupRevision] = useState(0);
  const [target, setTarget] = useState<AgentPersonTarget>({
    mode: "new_person",
  });
  const [differentPersonConfirmed, setDifferentPersonConfirmed] =
    useState(false);
  const [identityDetailsOpen, setIdentityDetailsOpen] = useState(
    !initialDraft || !initialDraft.name || !initialDraft.relationshipContext,
  );
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(
    !initialDraft ||
      !initialDraft.relationshipContext ||
      !initialDraft.sourceNote,
  );
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsedIdentityClue = useMemo(
    () => parseIdentityHandleQuery(identityClue),
    [identityClue],
  );
  const maskedIdentityClue = parsedIdentityClue
    ? maskIdentityHandle(
        parsedIdentityClue.type,
        parsedIdentityClue.value,
      )
    : null;
  const exactMatches = exactPersonNameMatches(name, matches);
  const currentPersonMatches = currentPersonId
    ? exactMatches.some((person) => person.id === currentPersonId)
    : false;
  const duplicateMatches = currentPersonMatches
    ? exactMatches.filter((person) => person.id !== currentPersonId)
    : [];
  const confirmedHandleMatches =
    confirmedHandlePersonMatches(matches);
  const expiredHandleMatches = expiredHandlePersonMatches(matches);
  const visibleMatches = showAllMatches ? matches : matches.slice(0, 3);
  const newPersonAllowed = canCreateDistinctPerson({
    differentPersonConfirmed,
    lookupState,
    matches,
    name,
  });
  const targetHasContext =
    target.mode === "existing_context" ||
    contextLabel.trim().length > 0;
  const targetSelectable =
    target.mode === "new_person" ||
    canSelectPersonForIdentityClue(target.person, matches);
  const identityChoiceNeedsReview =
    lookupState === "ready" &&
    matches.length > 0 &&
    target.mode === "new_person" &&
    (matches.length > 1 || confirmedHandleMatches.length > 0);
  const ready =
    name.trim().length > 0 &&
    (identityClue.trim().length === 0 ||
      parsedIdentityClue !== null) &&
    targetHasContext &&
    targetSelectable &&
    firstNote.trim().length > 0 &&
    (target.mode !== "new_person" || newPersonAllowed);
  const reviewReady =
    identityChoiceNeedsReview &&
    name.trim().length > 0 &&
    contextLabel.trim().length > 0 &&
    firstNote.trim().length > 0;

  useEffect(() => {
    const nameQuery = name.normalize("NFKC").trim();
    const clueQuery = parsedIdentityClue
      ? identityClue.normalize("NFKC").trim()
      : "";
    const queries = [...new Set([nameQuery, clueQuery].filter(Boolean))];
    if (queries.length === 0) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.all(
        queries.map(async (query) => {
          const response = await relationshipIntegrationFetch(
            "/api/local-integration/people/search",
            {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
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
                : "Existing people could not be checked.",
            );
          }
          return payload.people;
        }),
      )
        .then((groups) => {
          setMatches(mergePersonDirectoryMatches(groups));
          setLookupState("ready");
        })
        .catch((caught: unknown) => {
          if (
            caught instanceof DOMException &&
            caught.name === "AbortError"
          ) {
            return;
          }
          setLookupState("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    identityClue,
    lookupRevision,
    name,
    parsedIdentityClue,
  ]);

  async function commitPersonSource() {
    if (!ready) {
      setError(
        lookupState === "error"
          ? "Check existing people before creating a new identity."
          : "Choose the person, relationship context, and first source.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/resources",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          request_id: requestIdRef.current,
          ...agentPersonScopeFields(target, name, contextLabel),
          type: "note",
          title:
            target.mode === "new_person"
              ? "First recruiter-provided context"
              : "Agent-attached recruiter context",
          value: firstNote.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The relationship source could not be saved.",
        );
      }
      const first = payload.receipts[0];
      if (
        !first?.identity.person_id ||
        !first.identity.relationship_context_id
      ) {
        throw new Error(
          "The source still needs identity review before a person page can open.",
        );
      }
      const receipts = [...payload.receipts];
      if (identityClueConfirmed && parsedIdentityClue) {
        handleRequestIdRef.current ??= crypto.randomUUID();
        const handleResponse = await relationshipIntegrationFetch(
          "/api/local-integration/resources",
          {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request_id: handleRequestIdRef.current,
              scope_mode: "existing",
              person_id: first.identity.person_id,
              relationship_context_id:
                first.identity.relationship_context_id,
              type: "contact",
              value: identityClue.trim(),
              identity_clue_confirmed: true,
            }),
          },
        );
        const handlePayload = (await handleResponse.json()) as
          | { receipts: ResourceCaptureResponse[] }
          | { message?: string };
        if (
          !handleResponse.ok ||
          !("receipts" in handlePayload)
        ) {
          throw new Error(
            "The relationship source was saved, but the confirmed identity clue was not. Review the clue and retry to finish.",
          );
        }
        receipts.push(...handlePayload.receipts);
      }
      const personLabel =
        target.mode === "new_person"
          ? name.trim()
          : target.person.display_label;
      const savedContextLabel =
        target.mode === "existing_context"
          ? target.relationshipContext.display_label
          : contextLabel.trim();
      onCommitted(
        {
          contract_version: first.contract_version,
          person: {
            id: first.identity.person_id,
            display_label: personLabel,
          },
          relationship_context: {
            id: first.identity.relationship_context_id,
            display_label: savedContextLabel,
          },
        },
        receipts,
        agentPersonOutcome(target),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The relationship source could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deferIdentityReview() {
    if (!reviewReady) {
      setError(
        "Add the intended relationship context and first source before saving this identity review.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await relationshipIntegrationFetch(
        "/api/local-integration/resources",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          request_id: requestIdRef.current,
          scope_mode: "identity_candidates",
          candidate_person_ids: matches.map((person) => person.id),
          contact_name: name.trim(),
          relationship_context_label: contextLabel.trim(),
          type: "note",
          title: "Recruiter source awaiting identity",
          value: firstNote.trim(),
          }),
        },
      );
      const payload = (await response.json()) as
        | { receipts: ResourceCaptureResponse[] }
        | { message?: string };
      if (!response.ok || !("receipts" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The unresolved source could not be saved.",
        );
      }
      const caseId =
        payload.receipts[0]?.identity.resolution_case_id ?? null;
      if (!caseId) {
        throw new Error(
          "The source was saved without a resumable identity review case.",
        );
      }
      onDeferred(caseId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The unresolved source could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="agent-create-title"
      className="context-agent-create"
    >
      <header>
        <span>
          <UserPlus aria-hidden="true" size={16} />
        </span>
        <div>
          <strong id="agent-create-title">
            {initialDraft ? "New contact draft" : "Resolve the person before creating"}
          </strong>
          <p>
            {initialDraft
              ? "Agent extracted a proposal from your message. Review the identity result before anything changes."
              : "Find an existing identity first, then bind one relationship and source."}
          </p>
        </div>
        <button
          aria-label="Cancel person draft"
          className="context-icon-button"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      {initialDraft ? (
        <div className="context-agent-create__draft-summary">
          <p>
            <strong>{name || "Name needed"}</strong>
            <span>{contextLabel || "Relationship context needed"}</span>
          </p>
          <small>{firstNote}</small>
          <i>Proposed only · nothing has changed</i>
        </div>
      ) : null}
      {error ? <p className="context-agent-create__error">{error}</p> : null}
      <details
        className="context-agent-create__details"
        onToggle={(event) =>
          setIdentityDetailsOpen(event.currentTarget.open)
        }
        open={identityDetailsOpen}
      >
        <summary>{initialDraft ? "Edit extracted details" : "Contact details"}</summary>
      <label>
        <span>Person</span>
        <input
          autoComplete="off"
          maxLength={200}
          onChange={(event) => {
            const nextName = event.target.value;
            setName(nextName);
            setIdentityClueConfirmed(false);
            setMatches([]);
            setLookupState(
              nextName.normalize("NFKC").trim() ||
                identityClue.normalize("NFKC").trim()
                ? "loading"
                : "idle",
            );
            setTarget({ mode: "new_person" });
            setDifferentPersonConfirmed(false);
            setShowAllMatches(false);
            requestIdRef.current = null;
            handleRequestIdRef.current = null;
          }}
          placeholder="e.g. 陈雅宁"
          value={name}
        />
      </label>
      <label>
        <span>
          Known identity clue <small>Optional</small>
        </span>
        <input
          autoComplete="off"
          maxLength={500}
          onChange={(event) => {
            const nextClue = event.target.value;
            setIdentityClue(nextClue);
            setIdentityClueConfirmed(false);
            setMatches([]);
            setLookupState(
              name.normalize("NFKC").trim() ||
                nextClue.normalize("NFKC").trim()
                ? "loading"
                : "idle",
            );
            setTarget({ mode: "new_person" });
            setDifferentPersonConfirmed(false);
            setShowAllMatches(false);
            requestIdRef.current = null;
            handleRequestIdRef.current = null;
          }}
          placeholder="Email, phone, LinkedIn URL, or wechat:ID"
          value={identityClue}
        />
        <small>
          Used only for account-scoped lookup. Raw values are not returned in
          results.
        </small>
      </label>
      {identityClue.trim() && !parsedIdentityClue ? (
        <p className="context-agent-create__error">
          Use an email, phone, public profile URL, or an explicit
          “wechat:ID”.
        </p>
      ) : null}
      </details>
      <div
        className="context-agent-identity-check"
        data-state={lookupState}
      >
        <header>
          <span>Identity check</span>
          <i>
            {lookupState === "loading"
              ? "Checking"
              : lookupState === "ready"
                ? `${matches.length} possible`
                : lookupState === "error"
                  ? "Unavailable"
                  : "Required"}
          </i>
        </header>
        {lookupState === "idle" ? (
          <p>
            Enter a name or known identity clue before choosing new or
            existing.
          </p>
        ) : lookupState === "loading" ? (
          <p>
            <CircleNotch aria-hidden="true" className="spin" size={13} />
            Looking only inside this recruiter account.
          </p>
        ) : lookupState === "error" ? (
          <div className="context-agent-identity-error">
            <p>
              Existing people could not be checked. New identity creation is
              paused.
            </p>
            <button
              className="context-secondary-button"
              onClick={() => {
                setLookupState("loading");
                setLookupRevision((value) => value + 1);
              }}
              type="button"
            >
              Retry identity check
            </button>
          </div>
        ) : matches.length > 0 ? (
          <div className="context-agent-person-matches">
            <p>
              Confirmed handles are current identity evidence. Expired handles
              remain review clues only; you still make the binding.
            </p>
            {visibleMatches.map((person) => {
              const temporalRole =
                personIdentityTemporalRole(person);
              const selectable =
                canSelectPersonForIdentityClue(person, matches);
              return (
                <article
                  data-selectable={selectable}
                  data-selected={
                    target.mode !== "new_person" &&
                    target.person.id === person.id
                  }
                  data-temporal-role={temporalRole}
                  key={person.id}
                >
                <header>
                  <span>{personInitials(person.display_label)}</span>
                  <p>
                    <strong>{person.display_label}</strong>
                    <small>
                      {person.context_count}{" "}
                      {person.context_count === 1
                        ? "relationship"
                        : "relationships"}{" "}
                      · {person.capture_count} sources
                    </small>
                  </p>
                  <i className="context-agent-temporal-status">
                    {temporalRole === "current" ? (
                      <>
                        <ShieldCheck aria-hidden="true" size={12} />
                        Current clue
                      </>
                    ) : temporalRole === "historical" ? (
                      <>
                        <Clock aria-hidden="true" size={12} />
                        Historical clue
                      </>
                    ) : (
                      "Name only"
                    )}
                  </i>
                </header>
                <ul
                  aria-label={`Why ${person.display_label} matched`}
                  className="context-agent-match-reasons"
                >
                  {person.identity_matches.map((match) => (
                    <li
                      data-kind={match.kind}
                      key={
                        match.kind === "name"
                          ? "name"
                          : `${match.handle_type}:${match.display_hint}`
                      }
                    >
                      {match.kind === "name" ? (
                        <>Name match only</>
                      ) : match.kind === "expired_handle" ? (
                        <>
                          <Clock aria-hidden="true" size={12} />
                          Expired{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint} · needs a fresh source
                        </>
                      ) : (
                        <>
                          <ShieldCheck
                            aria-hidden="true"
                            size={12}
                          />
                          Confirmed{" "}
                          {identityHandleLabel(match.handle_type)} ·{" "}
                          {match.display_hint}
                          {match.source_resource_id
                            ? " · source-linked"
                            : ""}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {temporalRole !== "name_only" ? (
                  <p className="context-agent-temporal-note">
                    {selectable
                      ? temporalRole === "current"
                        ? "Current source-linked authority. A new source can attach here after your explicit choice."
                        : "No current owner exists. This historical clue may be reconfirmed only from the fresh source and your explicit choice."
                      : "Visible for comparison only. It cannot receive this source while another person holds current authority."}
                  </p>
                ) : null}
                <div>
                  {agentRelationshipContexts(person).map((context) => (
                    <button
                      data-active={
                        target.mode === "existing_context" &&
                        target.relationshipContext.id === context.id
                      }
                      disabled={!selectable}
                      key={context.id}
                      onClick={() => {
                        setTarget({
                          mode: "existing_context",
                          person,
                          relationshipContext: context,
                        });
                        setName(person.display_label);
                        setContextLabel(context.display_label);
                        setDifferentPersonConfirmed(false);
                        requestIdRef.current = null;
                        handleRequestIdRef.current = null;
                      }}
                      type="button"
                    >
                      <CheckCircle aria-hidden="true" size={13} />
                      {context.display_label}
                    </button>
                  ))}
                  <button
                    data-active={
                      target.mode === "existing_person_new_context" &&
                      target.person.id === person.id
                    }
                    disabled={!selectable}
                    onClick={() => {
                      setTarget({
                        mode: "existing_person_new_context",
                        person,
                      });
                      setName(person.display_label);
                      setDifferentPersonConfirmed(false);
                      requestIdRef.current = null;
                      handleRequestIdRef.current = null;
                    }}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={13} />
                    New relationship
                  </button>
                </div>
                </article>
              );
            })}
            {matches.length > visibleMatches.length ? (
              <button
                className="context-agent-show-matches"
                onClick={() => setShowAllMatches(true)}
                type="button"
              >
                Show {matches.length - visibleMatches.length} more possible matches
              </button>
            ) : showAllMatches && matches.length > 3 ? (
              <button
                className="context-agent-show-matches"
                onClick={() => setShowAllMatches(false)}
                type="button"
              >
                Show fewer matches
              </button>
            ) : null}
            {duplicateMatches.length > 0 && onReviewDuplicates ? (
              <button
                className="context-agent-create-distinct"
                onClick={onReviewDuplicates}
                type="button"
              >
                Review {duplicateMatches.length === 1 ? "possible duplicate" : `${duplicateMatches.length} possible duplicates`}
                <small>
                  Opens the reversible merge preview. Nothing merges from this contact draft.
                </small>
              </button>
            ) : null}
          </div>
        ) : (
          <p>
            No existing person matched the supplied name or confirmed identity
            clue. Creating a new identity is available.
          </p>
        )}
        {lookupState === "ready" &&
        (exactMatches.length > 0 || expiredHandleMatches.length > 0) &&
        confirmedHandleMatches.length === 0 &&
        target.mode === "new_person" ? (
          <label className="context-agent-distinct-person">
            <input
              checked={differentPersonConfirmed}
              onChange={(event) => {
                setDifferentPersonConfirmed(event.target.checked);
                requestIdRef.current = null;
                handleRequestIdRef.current = null;
              }}
              type="checkbox"
            />
            <span>
              This is a different person from the existing identity clue
              <small>
                {expiredHandleMatches.length > 0
                  ? "Required because this clue had a prior owner but is no longer current."
                  : "Required because an exact account-scoped name already exists."}
              </small>
            </span>
          </label>
        ) : null}
        {lookupState === "ready" &&
        confirmedHandleMatches.length > 0 &&
        target.mode === "new_person" ? (
          <div
            className="context-agent-handle-owner"
            role="note"
          >
            <ShieldCheck aria-hidden="true" size={15} />
            <p>
              <strong>
                Current owner:{" "}
                {confirmedHandleMatches
                  .map((person) => person.display_label)
                  .join(", ")}
              </strong>
              <small>
                Choose the current person, remove the clue, or keep this
                source unresolved. Historical owners stay visible for
                comparison but cannot receive the source.
              </small>
            </p>
          </div>
        ) : null}
        {lookupState === "ready" &&
        matches.length > 0 &&
        confirmedHandleMatches.length === 0 &&
        target.mode !== "new_person" ? (
          <button
            className="context-agent-create-distinct"
            onClick={() => {
              setTarget({ mode: "new_person" });
              setContextLabel("");
              setDifferentPersonConfirmed(false);
              requestIdRef.current = null;
              handleRequestIdRef.current = null;
            }}
            type="button"
          >
            Create a different person instead
          </button>
        ) : null}
      </div>
      {parsedIdentityClue && maskedIdentityClue ? (
        <label className="context-agent-distinct-person">
          <input
            checked={identityClueConfirmed}
            disabled={
              lookupState !== "ready" || identityChoiceNeedsReview
            }
            onChange={(event) => {
              setIdentityClueConfirmed(event.target.checked);
              handleRequestIdRef.current = null;
            }}
            type="checkbox"
          />
          <span>
            Save {maskedIdentityClue} as a confirmed{" "}
            {identityHandleLabel(parsedIdentityClue.type)} clue
            <small>
              {identityChoiceNeedsReview
                ? "Choose the identity before confirming this clue."
                : "Stores a hash, masked hint, governed source, and review deadline, not the raw value. Email, phone, and WeChat clues are reviewed annually."}
            </small>
          </span>
        </label>
      ) : null}
      <details
        className="context-agent-create__details"
        onToggle={(event) => setSourceDetailsOpen(event.currentTarget.open)}
        open={sourceDetailsOpen}
      >
        <summary>Relationship and source</summary>
        <label>
          <span>Relationship context</span>
          <input
            autoComplete="off"
            disabled={target.mode === "existing_context"}
            maxLength={200}
            onChange={(event) => {
              setContextLabel(event.target.value);
              requestIdRef.current = null;
              handleRequestIdRef.current = null;
            }}
            placeholder="e.g. VP Product search"
            value={contextLabel}
          />
        </label>
        <label>
          <span>First source</span>
          <textarea
            maxLength={8_000}
            onChange={(event) => {
              setFirstNote(event.target.value);
              requestIdRef.current = null;
            }}
            placeholder="Paste the recruiter-owned note that justifies creating this relationship."
            rows={3}
            value={firstNote}
          />
        </label>
      </details>
      <footer>
        <p>
          {target.mode === "existing_context"
            ? "This attaches the note to the selected existing relationship."
            : target.mode === "existing_person_new_context"
              ? "This keeps the existing person and creates only a separate relationship context."
              : "This creates a distinct person only after the account-scoped identity check."}{" "}
          It never merges or contacts anyone.
        </p>
        <div className="context-agent-create__footer-actions">
          {reviewReady ? (
            <button
              className="context-secondary-button"
              disabled={busy}
              onClick={() => void deferIdentityReview()}
              type="button"
            >
              Save for identity review
            </button>
          ) : null}
          <button
            className="context-primary-button context-primary-button--compact"
            disabled={!ready || busy}
            onClick={() => void commitPersonSource()}
            type="button"
          >
            {busy ? (
              <CircleNotch aria-hidden="true" className="spin" size={16} />
            ) : (
              <ArrowRight aria-hidden="true" size={16} />
            )}
            {busy
              ? "Saving"
              : target.mode === "existing_context"
                ? "Attach source"
                : target.mode === "existing_person_new_context"
                  ? "Add relationship"
                  : "Create new person"}
          </button>
        </div>
      </footer>
    </section>
  );
}
