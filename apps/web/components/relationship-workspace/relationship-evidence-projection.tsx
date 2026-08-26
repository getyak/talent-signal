import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import { LinkSimple } from "@phosphor-icons/react";

import { fieldLabel, formatDate } from "./relationship-display";

export function relationshipEvidenceProjectionState(
  workspace: WorkspaceReviewResponse,
) {
  return {
    active: workspace.confirmed_state.assertions.filter(
      (state) => state.state_status === "active",
    ),
    historical: workspace.confirmed_state.assertions.filter(
      (state) => state.state_status !== "active",
    ),
    sourceAuthorizationAvailable:
      workspace.source_authorization.state === "authorized",
  };
}

export function RelationshipEvidenceProjection({
  workspace,
}: {
  workspace: WorkspaceReviewResponse;
}) {
  const { active, historical, sourceAuthorizationAvailable } =
    relationshipEvidenceProjectionState(workspace);

  return (
    <>
      <section aria-labelledby="confirmed-title" className="context-section">
        <div className="context-section__heading">
          <div>
            <p className="eyebrow">KNOWN CONTEXT</p>
            <h2 id="confirmed-title">Confirmed in this relationship</h2>
          </div>
          <span>{active.length} active</span>
        </div>
        {active.length > 0 ? (
          <dl className="context-known">
            {active.map((state) => (
              <div key={state.id}>
                <dt>{fieldLabel(state.field)}</dt>
                <dd>{state.value}</dd>
                <a href={`#source-${state.evidence_id}`}>
                  <LinkSimple aria-hidden="true" size={15} />
                  Source
                </a>
              </div>
            ))}
          </dl>
        ) : (
          <p className="context-section__empty">
            Confirm a proposed fact to add it here. Model output alone never
            becomes remembered context.
          </p>
        )}
        {historical.length > 0 ? (
          <details className="context-retention context-known-history">
            <summary>Previous fact versions ({historical.length})</summary>
            <dl>
              {historical.map((state) => (
                <div key={state.id}>
                  <dt>{fieldLabel(state.field)}</dt>
                  <dd>
                    {state.value} · {state.state_status}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </section>

      <section
        aria-labelledby="source-title"
        className="context-section"
        id="source-evidence"
      >
        <div className="context-section__heading">
          <div>
            <p className="eyebrow">SOURCE</p>
            <h2 id="source-title">Reviewed extracted text</h2>
          </div>
          <span>{workspace.source_authorization.state}</span>
        </div>
        <div className="context-source-list">
          {workspace.capture.messages.map((message) => (
            <figure id={`source-${message.id}`} key={message.id} tabIndex={-1}>
              <figcaption>
                <span>{message.speaker}</span>
                <small>{message.source_message_id}</small>
              </figcaption>
              <blockquote>
                {message.text ??
                  (sourceAuthorizationAvailable
                    ? "Source text is no longer retained."
                    : `Source authorization is ${workspace.source_authorization.state}. Restore or renew it from Sources before reviewing the evidence.`)}
              </blockquote>
            </figure>
          ))}
        </div>
        <details className="context-retention">
          <summary>Retention and provenance</summary>
          <dl>
            <div>
              <dt>Stored source</dt>
              <dd>{workspace.capture.source.retention.source_scope}</dd>
            </div>
            <div>
              <dt>Raw screenshot</dt>
              <dd>Not stored by Talent Signal</dd>
            </div>
            <div>
              <dt>Retention until</dt>
              <dd>
                {workspace.capture.source.retention.retention_until
                  ? formatDate(
                      workspace.capture.source.retention.retention_until,
                    )
                  : "Review completion"}
              </dd>
            </div>
            <div>
              <dt>Producer</dt>
              <dd>{workspace.analysis.producer.name}</dd>
            </div>
          </dl>
        </details>
      </section>
    </>
  );
}
