import type { WorkspaceReviewResponse } from "@talent-signal/contracts";
import { ShieldCheck } from "@phosphor-icons/react";

import { sourceKindLabel, sourceScopeLabel } from "./relationship-display";

export function RelationshipSourceLineage({
  workspace,
}: {
  workspace: WorkspaceReviewResponse;
}) {
  return (
    <section aria-labelledby="lineage-title" className="context-lineage">
      <div className="context-lineage__heading">
        <div>
          <p className="eyebrow">SOURCE LINEAGE</p>
          <h2 id="lineage-title">How this contact came into view</h2>
        </div>
        <span>
          <ShieldCheck aria-hidden="true" size={15} weight="duotone" />
          Traceable
        </span>
      </div>
      <ol>
        <li>
          <i aria-hidden="true">01</i>
          <span>Source</span>
          <strong>{sourceKindLabel(workspace.capture.source.kind)}</strong>
          <small>
            {workspace.capture.source.source_timezone
              ? `Time zone ${workspace.capture.source.source_timezone}`
              : "Conversation date not confirmed"}
          </small>
        </li>
        <li>
          <i aria-hidden="true">02</i>
          <span>Identity anchor</span>
          <strong>{workspace.subject.display_label}</strong>
          <small>Bound by the recruiter, not guessed from a face</small>
        </li>
        <li>
          <i aria-hidden="true">03</i>
          <span>Relationship scope</span>
          <strong>{workspace.assignment.display_label}</strong>
          <small>Context stays inside this relationship</small>
        </li>
        <li>
          <i aria-hidden="true">04</i>
          <span>Current projection</span>
          <strong>Living contact</strong>
          <small>
            {sourceScopeLabel(
              workspace.capture.source.retention.source_scope,
            )}
          </small>
        </li>
      </ol>
      <p className="context-lineage__note">
        The small chat avatar is source context, not a verified portrait. Until
        the recruiter adds a confirmed photo, this page uses a neutral monogram.
      </p>
    </section>
  );
}
