"use client";

import { Trash } from "@phosphor-icons/react";
import { useState } from "react";

export type GovernedCaptureDeletionReceipt = {
  derivatives: number;
  lineage: number;
};

type DeletionPayload = {
  deletion?: { derivatives_deleted: number };
  lineage?: { lineage: unknown[] };
  message?: string;
};

export function governedCaptureDeletionReceipt(
  payload: DeletionPayload,
): GovernedCaptureDeletionReceipt | null {
  if (!payload.deletion || !payload.lineage) {
    return null;
  }
  return {
    derivatives: payload.deletion.derivatives_deleted,
    lineage: payload.lineage.lineage.length,
  };
}

export function GovernedCaptureDeletion({
  busy,
  captureId,
  onBusyChange,
  onDeleted,
  onError,
}: {
  busy: boolean;
  captureId: string;
  onBusyChange: (label: string) => void;
  onDeleted: (receipt: GovernedCaptureDeletionReceipt) => void;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  async function deleteCapture() {
    onBusyChange("Deleting governed source");
    onError("");
    try {
      const response = await fetch(
        `/api/local-integration/captures/${captureId}/deletion`,
        { method: "POST" },
      );
      const payload = (await response.json()) as DeletionPayload;
      const receipt = governedCaptureDeletionReceipt(payload);
      if (!response.ok || !receipt) {
        throw new Error(
          payload.message ?? "The governed source could not be deleted.",
        );
      }
      setConfirming(false);
      onDeleted(receipt);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "The governed source could not be deleted.",
      );
    } finally {
      onBusyChange("");
    }
  }

  return (
    <section className="context-danger-zone">
      <button
        className="context-text-button"
        onClick={() => setConfirming((current) => !current)}
        type="button"
      >
        <Trash aria-hidden="true" size={16} />
        Delete governed source
      </button>
      {confirming ? (
        <div>
          <p>
            This removes source text and registered derivatives. Audit-safe
            identifiers remain without conversation content.
          </p>
          <button
            className="context-secondary-button"
            onClick={() => setConfirming(false)}
            type="button"
          >
            Keep source
          </button>
          <button
            className="context-danger-button"
            disabled={busy}
            onClick={() => void deleteCapture()}
            type="button"
          >
            <Trash aria-hidden="true" size={16} />
            Delete now
          </button>
        </div>
      ) : null}
    </section>
  );
}
