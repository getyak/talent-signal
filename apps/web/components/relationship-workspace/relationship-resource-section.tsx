import type { ResourceCaptureResponse } from "@talent-signal/contracts";
import { Plus } from "@phosphor-icons/react";

import { RelationshipResourceComposer } from "./relationship-resource-composer";

export function RelationshipResourceSection({
  open,
  onCommitted,
  onEvidenceChanged,
  onIdentityCorrected,
  onOpen,
  onReviewCapture,
  onScreenshot,
  personId,
  relationshipContextId,
  scopeLabel,
}: {
  open: boolean;
  onCommitted: (receipts: ResourceCaptureResponse[]) => void;
  onEvidenceChanged: (
    announcement?: string,
    relationshipRemoved?: boolean,
  ) => void | Promise<void>;
  onIdentityCorrected: (input: {
    captureId: string;
    captureIdsRebound: number;
    personId: string;
    relationshipContextId: string;
  }) => Promise<"opened" | "session_expired" | "unavailable">;
  onOpen: () => void;
  onReviewCapture: (captureId: string) => void | Promise<void>;
  onScreenshot: () => void;
  personId: string;
  relationshipContextId: string;
  scopeLabel: string;
}) {
  if (open) {
    return (
      <RelationshipResourceComposer
        onCommitted={onCommitted}
        onEvidenceChanged={onEvidenceChanged}
        onIdentityCorrected={onIdentityCorrected}
        onReviewCapture={onReviewCapture}
        onScreenshot={onScreenshot}
        personId={personId}
        relationshipContextId={relationshipContextId}
        scopeLabel={scopeLabel}
      />
    );
  }

  return (
    <section className="context-resource-launcher" id="relationship-resources">
      <div>
        <span>
          <Plus aria-hidden="true" size={16} />
        </span>
        <p>
          <strong>Add another governed source</strong>
          <small>Note, transcript, file, link, resume, or screenshot</small>
        </p>
      </div>
      <button
        className="context-secondary-button"
        onClick={onOpen}
        type="button"
      >
        Choose source
      </button>
    </section>
  );
}
