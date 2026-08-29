"use client";

import { Trash } from "@phosphor-icons/react";
import { useState } from "react";

import { relationshipIntegrationFetch } from "@/components/workspace-session-request";

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
    onBusyChange("正在删除受治理来源");
    onError("");
    try {
      const response = await relationshipIntegrationFetch(
        `/api/local-integration/captures/${captureId}/deletion`,
        { method: "POST" },
      );
      const payload = (await response.json()) as DeletionPayload;
      const receipt = governedCaptureDeletionReceipt(payload);
      if (!response.ok || !receipt) {
        throw new Error(
          payload.message ?? "无法删除受治理来源。",
        );
      }
      setConfirming(false);
      onDeleted(receipt);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "无法删除受治理来源。",
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
        删除受治理来源
      </button>
      {confirming ? (
        <div>
          <p>
            这会移除来源文本与已登记的衍生数据。审计安全标识符会保留，但不包含对话内容。
          </p>
          <button
            className="context-secondary-button"
            onClick={() => setConfirming(false)}
            type="button"
          >
            保留来源
          </button>
          <button
            className="context-danger-button"
            disabled={busy}
            onClick={() => void deleteCapture()}
            type="button"
          >
            <Trash aria-hidden="true" size={16} />
            立即删除
          </button>
        </div>
      ) : null}
    </section>
  );
}
