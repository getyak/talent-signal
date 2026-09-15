"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type CapabilityReport,
  type PlatformAdapter,
  type PlatformCapability,
  availabilityFor,
  availabilityLabel,
} from "../platform/ports.js";
import { capabilityBlockReason } from "../state/workbenchState.js";
import { WORKSPACE_SURFACE_CLASS } from "../theme/tokens.js";

export type NativeCapabilityStatusProps = {
  readonly adapter: PlatformAdapter;
  readonly title?: string;
  readonly description?: string;
};

const CAPABILITIES: readonly { capability: PlatformCapability; label: string }[] = [
  { capability: "window_capture", label: "窗口采集" },
  { capability: "local_ocr", label: "本地文字识别" },
  { capability: "quick_panel", label: "快捷面板" },
  { capability: "notification", label: "状态通知" },
];

/**
 * Read-only capability projection for hosts that cannot safely provide an
 * account/session scope. It never accepts a scope and therefore cannot request
 * an operation. Web uses this instead of inventing native identifiers.
 */
export function NativeCapabilityStatus({
  adapter,
  title = "桌面原生能力",
  description = "状态由当前主机核验。远程 Web 内容不会获得桌面采集、OCR、快捷面板或系统通知权限。",
}: NativeCapabilityStatusProps) {
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void adapter.capabilities().then(
      (value) => {
        if (active) {
          setReport(value);
          setError(null);
        }
      },
      () => {
        if (active) {
          setReport(null);
          setError("主机能力无法核验；全部按不可用处理。");
        }
      },
    );
    return () => {
      active = false;
    };
  }, [adapter]);

  const rows = useMemo(
    () =>
      CAPABILITIES.map(({ capability, label }) => ({
        availability: availabilityFor(report, capability),
        capability,
        label,
        reason: capabilityBlockReason(report, capability),
      })),
    [report],
  );

  return (
    <section
      aria-labelledby="ts-native-capability-status-title"
      className={WORKSPACE_SURFACE_CLASS}
      data-adapter-host={adapter.host}
      data-capability-mode="status-only"
    >
      <header style={{ marginBottom: "var(--ts-space-lg)" }}>
        <p className="ts-kicker">本机边界</p>
        <h2 className="ts-heading" id="ts-native-capability-status-title">
          {title}
        </h2>
        <p className="ts-description">{description}</p>
        {error ? <p role="alert">{error}</p> : null}
      </header>
      <ul className="ts-capability-list">
        {rows.map((row) => (
          <li
            className="ts-capability-row"
            data-availability={row.availability}
            data-capability={row.capability}
            key={row.capability}
          >
            <div>
              <strong>{row.label}</strong>
              {row.reason ? <p>{row.reason}</p> : null}
            </div>
            <span className="ts-status" data-state={row.availability}>
              {availabilityLabel(row.availability)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
