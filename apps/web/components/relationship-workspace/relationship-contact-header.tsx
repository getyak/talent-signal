import type {
  RelationshipScope,
  WorkspaceReviewResponse,
} from "@talent-signal/contracts";
import {
  AddressBook,
  Clock,
  FileImage,
  ShieldCheck,
} from "@phosphor-icons/react";

import { formatDate, sourceKindLabel } from "./relationship-display";

type Scope = Pick<RelationshipScope, "person" | "relationship_context">;

export function relationshipCurrentDependency(
  workspace: WorkspaceReviewResponse,
) {
  if (workspace.source_authorization.state !== "authorized") {
    return `Source access ${workspace.source_authorization.state}`;
  }
  if (workspace.latest_effect?.outcome?.status === "verified") {
    return "Next move recorded";
  }
  if (
    workspace.analysis.assertions.some(
      (assertion) => assertion.review_status === "pending",
    )
  ) {
    return "Evidence needs review";
  }
  if (
    workspace.analysis.assertions.some(
      (assertion) => assertion.review_status === "confirmed",
    )
  ) {
    return "Context is current";
  }
  return "No confirmed change";
}

export function RelationshipContactHeader({
  scope,
  workspace = null,
}: {
  scope: Scope;
  workspace?: WorkspaceReviewResponse | null;
}) {
  return (
    <section className="context-contact-header" id="contact-overview">
      <div className="context-contact-header__portrait">
        <div
          aria-label={`${scope.person.display_label} initials; no verified contact photo`}
          className="context-contact-header__avatar"
          role="img"
        >
          {scope.person.display_label.trim().slice(0, 1).toUpperCase()}
        </div>
        <span>No verified photo</span>
      </div>
      <div className="context-contact-header__identity">
        <p className="eyebrow">
          {workspace ? "LIVING CONTACT PAGE" : "LIVING PERSON PAGE"}
        </p>
        <h1 data-long={scope.person.display_label.length > 22}>
          {scope.person.display_label}
        </h1>
        <p>{scope.relationship_context.display_label}</p>
        <div>
          <span>
            <AddressBook aria-hidden="true" size={14} />
            Identity bound by recruiter
          </span>
          {workspace ? (
            <>
              <span>
                <FileImage aria-hidden="true" size={14} />
                {sourceKindLabel(workspace.capture.source.kind)}
              </span>
              <span>
                <Clock aria-hidden="true" size={14} />
                Updated {formatDate(workspace.analysis.created_at)}
              </span>
            </>
          ) : (
            <span>
              <ShieldCheck aria-hidden="true" size={14} />
              Source claims stay reviewable
            </span>
          )}
        </div>
      </div>
      {workspace ? (
        <div className="context-contact-header__signal">
          <span>Current dependency</span>
          <strong>{relationshipCurrentDependency(workspace)}</strong>
          <small>Derived from review state. It never rates the person.</small>
        </div>
      ) : null}
    </section>
  );
}
