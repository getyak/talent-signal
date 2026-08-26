import type {
  RelationshipScope,
  ResourceCaptureResponse,
} from "@talent-signal/contracts";
import { ArrowRight, Prohibit } from "@phosphor-icons/react";

import type { GovernedCaptureDeletionReceipt } from "./governed-capture-deletion";
import { StartRelationshipPanel } from "./start-relationship-panel";

export function RelationshipOnboarding({
  deletionSummary,
  onCommitted,
  onScreenshot,
}: {
  deletionSummary: GovernedCaptureDeletionReceipt | null;
  onCommitted: (
    scope: RelationshipScope,
    receipts: ResourceCaptureResponse[],
    outcome:
      | "created_person"
      | "created_relationship_context"
      | "reused_relationship",
  ) => void;
  onScreenshot: () => void;
}) {
  return (
    <section className="context-onboarding">
      <header className="context-onboarding__header">
        <p className="eyebrow">RELATIONSHIP INTELLIGENCE</p>
        <h1>Begin with the source.</h1>
        <p>
          Bind one person and relationship, then review what the source can and
          cannot support.
        </p>
      </header>
      <div className="context-onboarding__workbench">
        <StartRelationshipPanel
          onCommitted={onCommitted}
          onScreenshot={onScreenshot}
        />
        <aside
          aria-label="From governed source to living Wiki"
          className="context-onboarding__artifact"
        >
          <div>
            <span>01</span>
            <p>
              <strong>Bring one source</strong>
              Note, transcript, file, link, or screenshot
            </p>
          </div>
          <ArrowRight aria-hidden="true" size={19} />
          <div>
            <span>02</span>
            <p>
              <strong>Bind the context</strong>
              Person and relationship stay explicit
            </p>
          </div>
          <ArrowRight aria-hidden="true" size={19} />
          <div>
            <span>03</span>
            <p>
              <strong>Compile the Wiki</strong>
              Evidence governs every task view
            </p>
          </div>
        </aside>
      </div>
      {deletionSummary ? (
        <div className="context-deletion-receipt">
          <Prohibit aria-hidden="true" size={19} />
          <p>
            <strong>Previous source deleted</strong>
            {deletionSummary.derivatives} derivatives removed ·{" "}
            {deletionSummary.lineage} audit-safe lineage entries retained.
          </p>
        </div>
      ) : null}
    </section>
  );
}
