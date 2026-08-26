"use client";

import {
  CONTRACT_VERSION,
  type IdentityResolutionCase,
  type IdentityResolutionDecisionResponse,
  type KnowledgeSnapshot,
  type RelationshipScope,
} from "@talent-signal/contracts";
import {
  Check,
  CheckCircle,
  CircleNotch,
  Plus,
  Warning,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";

type IdentityWorkflowResponse = {
  decision: IdentityResolutionDecisionResponse;
  identity_case: IdentityResolutionCase;
  compilation: KnowledgeSnapshot | null;
  compilation_error: string | null;
};

function formatIdentityReviewDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function identityReviewInitials(value: string) {
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

export function AgentIdentityReviewCard({
  identityCase,
  onCaseUpdated,
  onResolved,
}: {
  identityCase: IdentityResolutionCase;
  onCaseUpdated: (nextCase: IdentityResolutionCase) => void;
  onResolved: (
    scope: RelationshipScope,
    compilation: KnowledgeSnapshot | null,
    compilationError: string | null,
  ) => void;
}) {
  const requestIdRef = useRef<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [newContextLabel, setNewContextLabel] = useState(
    identityCase.relationship_context?.status === "proposed"
      ? identityCase.relationship_context.label
      : "",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedCandidate = identityCase.candidates.find(
    (candidate) => candidate.person_id === selectedPersonId,
  );
  const selectedExistingContext =
    selectedCandidate?.relationship_contexts.find(
      (context) => context.id === selectedContextId,
    ) ?? null;
  const usingNewContext = selectedContextId === "__new__";
  const bindReady =
    selectedCandidate !== undefined &&
    reason.trim().length > 0 &&
    ((usingNewContext && newContextLabel.trim().length > 0) ||
      selectedExistingContext !== null);

  function resetRequest() {
    requestIdRef.current = null;
  }

  async function decideIdentity(
    decision: "bind_existing" | "leave_unresolved",
  ) {
    if (!reason.trim() || (decision === "bind_existing" && !bindReady)) {
      setError(
        decision === "leave_unresolved"
          ? "Say what evidence is still missing before saving this for later."
          : "Choose one person, one relationship context, and explain the identity decision.",
      );
      return;
    }
    requestIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/local-integration/identity-resolution-cases/${identityCase.id}/decisions`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotency_key: requestIdRef.current,
            expected_case_version: identityCase.version,
            decision,
            reason: reason.trim(),
            ...(decision === "bind_existing" && selectedCandidate
              ? {
                  selected_person_id: selectedCandidate.person_id,
                  relationship_context: usingNewContext
                    ? {
                        status: "proposed",
                        label: newContextLabel.trim(),
                        purpose:
                          "Recruiter-defined relationship context after identity review",
                      }
                    : {
                        status: "existing",
                        relationship_context_id: selectedExistingContext?.id,
                      },
                }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as
        | IdentityWorkflowResponse
        | { message?: string };
      if (!response.ok || !("decision" in payload)) {
        throw new Error(
          "message" in payload && payload.message
            ? payload.message
            : "The identity decision could not be saved.",
        );
      }
      if (
        payload.decision.identity_status === "unresolved" ||
        !payload.decision.person_id ||
        !payload.decision.relationship_context_id ||
        !selectedCandidate
      ) {
        resetRequest();
        setReason("");
        onCaseUpdated(payload.identity_case);
        return;
      }
      onResolved(
        {
          contract_version: CONTRACT_VERSION,
          person: {
            id: payload.decision.person_id,
            display_label: selectedCandidate.display_label,
          },
          relationship_context: {
            id: payload.decision.relationship_context_id,
            display_label: usingNewContext
              ? newContextLabel.trim()
              : selectedExistingContext?.display_label ??
                "Selected relationship",
          },
        },
        payload.compilation,
        payload.compilation_error,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The identity decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="agent-identity-review-title"
      className="context-agent-identity-review"
    >
      <header>
        <span>
          <Warning aria-hidden="true" size={16} weight="fill" />
        </span>
        <div>
          <strong id="agent-identity-review-title">
            Identity still needs your decision
          </strong>
          <p>
            The source is saved, but it is not part of either person&apos;s Wiki
            yet.
          </p>
        </div>
        <i>Unresolved</i>
      </header>

      {identityCase.latest_decision?.decision === "leave_unresolved" ? (
        <div className="context-agent-identity-review__resume">
          <strong>Previously left unresolved</strong>
          <p>{identityCase.latest_decision.reason}</p>
          <small>
            Saved {formatIdentityReviewDate(identityCase.latest_decision.decided_at)}
          </small>
        </div>
      ) : null}

      <article className="context-agent-identity-review__source">
        <header>
          <span>Governed source</span>
          <i>{identityCase.source.display_name}</i>
        </header>
        <blockquote>{identityCase.source.excerpt}</blockquote>
        <footer>
          <span>{identityCase.source.kind.replaceAll("_", " ")}</span>
          <span>
            {identityCase.source.fragment_count}{" "}
            {identityCase.source.fragment_count === 1 ? "fragment" : "fragments"}
          </span>
          <span>{formatIdentityReviewDate(identityCase.source.observed_at)}</span>
        </footer>
      </article>

      <div className="context-agent-identity-review__candidates">
        <p>
          Compare only source-backed identity clues and relationship context.
          Choosing a person does not confirm the source&apos;s claims.
        </p>
        {identityCase.candidates.map((candidate) => (
          <article
            data-selected={selectedPersonId === candidate.person_id}
            key={candidate.person_id}
          >
            <button
              aria-pressed={selectedPersonId === candidate.person_id}
              onClick={() => {
                setSelectedPersonId(candidate.person_id);
                setSelectedContextId("");
                resetRequest();
              }}
              type="button"
            >
              <span>{identityReviewInitials(candidate.display_label)}</span>
              <p>
                <strong>{candidate.display_label}</strong>
                <small>
                  {candidate.context_count}{" "}
                  {candidate.context_count === 1
                    ? "relationship"
                    : "relationships"}{" "}
                  · {candidate.capture_count} sources
                </small>
              </p>
              <CheckCircle aria-hidden="true" size={17} />
            </button>
            <ul aria-label={`Why ${candidate.display_label} is possible`}>
              {candidate.match_reasons.map((matchReason) => (
                <li key={matchReason}>{matchReason}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {selectedCandidate ? (
        <fieldset className="context-agent-identity-review__contexts">
          <legend>Relationship context</legend>
          <p>
            Identity is shared; evidence remains inside the selected
            relationship.
          </p>
          <div>
            {selectedCandidate.relationship_contexts.map((context) => (
              <button
                aria-pressed={selectedContextId === context.id}
                key={context.id}
                onClick={() => {
                  setSelectedContextId(context.id);
                  resetRequest();
                }}
                type="button"
              >
                <CheckCircle aria-hidden="true" size={13} />
                {context.display_label}
              </button>
            ))}
            <button
              aria-pressed={usingNewContext}
              onClick={() => {
                setSelectedContextId("__new__");
                resetRequest();
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={13} />
              New relationship
            </button>
          </div>
          {usingNewContext ? (
            <label>
              <span>New relationship label</span>
              <input
                maxLength={200}
                onChange={(event) => {
                  setNewContextLabel(event.target.value);
                  resetRequest();
                }}
                placeholder="e.g. VP Product search"
                value={newContextLabel}
              />
            </label>
          ) : null}
        </fieldset>
      ) : null}

      <label className="context-agent-identity-review__reason">
        <span>
          Decision note <small>Required</small>
        </span>
        <textarea
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            resetRequest();
          }}
          placeholder="What distinguishes the right person, or what evidence is still missing?"
          rows={2}
          value={reason}
        />
      </label>
      {error ? (
        <p className="context-agent-create__error" role="alert">
          {error}
        </p>
      ) : null}
      <footer>
        <button
          className="context-secondary-button"
          disabled={busy || !reason.trim()}
          onClick={() => void decideIdentity("leave_unresolved")}
          type="button"
        >
          Leave unresolved
        </button>
        <button
          className="context-primary-button context-primary-button--compact"
          disabled={busy || !bindReady}
          onClick={() => void decideIdentity("bind_existing")}
          type="button"
        >
          {busy ? (
            <CircleNotch aria-hidden="true" className="spin" size={16} />
          ) : (
            <Check aria-hidden="true" size={16} />
          )}
          Confirm identity
        </button>
      </footer>
    </section>
  );
}
