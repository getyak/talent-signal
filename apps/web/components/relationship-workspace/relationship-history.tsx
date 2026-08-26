"use client";

import type { RelationshipAgentHistory } from "@talent-signal/contracts";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";

export function relationshipBriefContinuityReceipt(
  history: RelationshipAgentHistory | null,
) {
  const operation = history?.operations.find(
    (candidate) => candidate.kind === "chat_brief",
  );
  if (!operation) {
    return null;
  }
  return {
    detail: operation.detail,
    occurredAt: operation.occurred_at,
    snapshotId: operation.references.knowledge_snapshot_id,
    stale: operation.status !== "completed",
  };
}

function formatRelationshipHistoryDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function RelationshipExternalEffectReview({
  history,
}: {
  history: RelationshipAgentHistory | null;
}) {
  const followUps = history?.external_effect_follow_ups ?? [];
  if (followUps.length === 0) {
    return null;
  }
  const unresolvedCount = followUps.filter(
    (followUp) =>
      followUp.action_status === "unknown" ||
      followUp.action_status === "executing",
  ).length;
  return (
    <section
      aria-labelledby="external-effect-review-title"
      className="context-effect-review"
      id="external-effect-review"
    >
      <header className="context-effect-review__heading">
        <div>
          <p className="eyebrow">EXTERNAL EFFECT REVIEW</p>
          <h2 id="external-effect-review-title">
            Check what happened outside Talent Signal.
          </h2>
          <p>
            Source authorization ended after these effects were attempted. The
            records remain visible because authorization loss cannot undo
            something that may already exist elsewhere.
          </p>
        </div>
        <span data-has-unresolved={unresolvedCount > 0}>
          <Warning aria-hidden="true" size={16} />
          {unresolvedCount > 0
            ? `${unresolvedCount} ${
                unresolvedCount === 1 ? "result" : "results"
              } unresolved`
            : "Review complete"}
        </span>
      </header>
      <div className="context-effect-review__list">
        {followUps.map((followUp) => {
          const unresolved =
            followUp.action_status === "unknown" ||
            followUp.action_status === "executing";
          const resultLabel = unresolved
            ? followUp.action_status === "unknown"
              ? "Result unknown"
              : "Still executing"
            : followUp.outcome?.status === "verified"
              ? "Completed · verified"
              : "Completed · result recorded";
          const latestEvidence = followUp.outcome
            ? followUp.outcome.summary
            : followUp.observation
              ? `Destination observation was ${followUp.observation.match_status}.`
              : followUp.attempt
                ? `Latest attempt remains ${followUp.attempt.status}.`
                : "No external observation is recorded.";
          return (
            <article
              data-state={unresolved ? "unresolved" : "completed"}
              key={followUp.action_id}
            >
              <header>
                <span>{resultLabel}</span>
                <time dateTime={followUp.authorization.changed_at}>
                  Authorization {followUp.authorization.state}{" "}
                  {formatRelationshipHistoryDate(
                    followUp.authorization.changed_at,
                  )}
                </time>
              </header>
              <h3>
                {followUp.target ?? followUp.action_type.replaceAll("_", " ")}
              </h3>
              {followUp.reason ? <p>{followUp.reason}</p> : null}
              <div className="context-effect-review__decision">
                {unresolved ? (
                  <Warning aria-hidden="true" size={17} />
                ) : (
                  <CheckCircle aria-hidden="true" size={17} />
                )}
                <p>
                  <strong>
                    {unresolved
                      ? "Reconcile before retrying."
                      : "Recorded, not represented as undone."}
                  </strong>
                  <span>
                    {unresolved
                      ? "Check the real destination first. No observation means the system cannot safely call this failed or completed."
                      : "The external result remains part of history even though its source can no longer authorize future work."}
                  </span>
                </p>
              </div>
              <dl>
                <div>
                  <dt>Destination</dt>
                  <dd>{followUp.destination_key ?? "No destination recorded"}</dd>
                </div>
                <div>
                  <dt>Latest evidence</dt>
                  <dd>{latestEvidence}</dd>
                </div>
                <div>
                  <dt>Attempt</dt>
                  <dd>
                    {followUp.attempt
                      ? `${followUp.attempt.status} · ${formatRelationshipHistoryDate(
                          followUp.attempt.started_at,
                        )}`
                      : "No attempt record"}
                  </dd>
                </div>
              </dl>
              <footer>
                <ShieldCheck aria-hidden="true" size={14} />
                Nothing will contact the person or change the destination
                without a new recruiter decision.
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function RelationshipHistoryTimeline({
  history,
  onReviewMerge,
}: {
  history: RelationshipAgentHistory | null;
  onReviewMerge: (operationId: string) => void;
}) {
  const followUps = history?.external_effect_follow_ups ?? [];
  if (
    !history ||
    (history.operations.length === 0 && followUps.length === 0)
  ) {
    return null;
  }
  const latest = history.operations[0];
  return (
    <details className="context-agent-history">
      <summary>
        {followUps.length > 0 ? (
          <Warning aria-hidden="true" size={15} />
        ) : (
          <Clock aria-hidden="true" size={15} />
        )}
        <span>
          <strong>Relationship history</strong>
          <small>
            {followUps.length > 0
              ? `${followUps.length} preserved external ${
                  followUps.length === 1 ? "effect needs" : "effects need"
                } your review`
              : latest
                ? `${latest.title} · ${formatRelationshipHistoryDate(latest.occurred_at)}`
                : "Governed operations"}
          </small>
        </span>
        <i>{history.operations.length + followUps.length}</i>
      </summary>
      {followUps.length > 0 ? (
        <a
          className="context-agent-follow-up-link"
          href="#external-effect-review"
        >
          <span>
            <Warning aria-hidden="true" size={15} />
          </span>
          <p>
            <strong>Review preserved external effects</strong>
            <small>Compare destination evidence on the living person page.</small>
          </p>
          <ArrowRight aria-hidden="true" size={15} />
        </a>
      ) : null}
      <ol>
        {history.operations.slice(0, 12).map((operation) => (
          <li data-status={operation.status} key={operation.id}>
            <span aria-hidden="true" />
            <article>
              <header>
                <strong>{operation.title}</strong>
                <time dateTime={operation.occurred_at}>
                  {formatRelationshipHistoryDate(operation.occurred_at)}
                </time>
              </header>
              <p>{operation.detail}</p>
              <footer>
                <span>{operation.status.replaceAll("_", " ")}</span>
                <span>
                  {operation.actor_kind === "recruiter"
                    ? "Recruiter decision"
                    : "System projection"}
                </span>
                {operation.references.knowledge_snapshot_id ? (
                  <span>
                    Snapshot {operation.references.knowledge_snapshot_id.slice(0, 8)}
                  </span>
                ) : null}
                {operation.kind === "identity_merge" &&
                operation.status === "completed" &&
                operation.provenance.event_type === "identity.people_merged" &&
                operation.references.person_merge_operation_id ? (
                  <button
                    onClick={() =>
                      onReviewMerge(
                        operation.references.person_merge_operation_id as string,
                      )
                    }
                    type="button"
                  >
                    Review reversal
                    <ArrowRight aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </footer>
            </article>
          </li>
        ))}
      </ol>
      {history.operations.length > 12 ? (
        <p>
          Showing the latest 12 of {history.operations.length} governed
          operations.
        </p>
      ) : null}
    </details>
  );
}
