"use client";

import { ArrowDown, SlidersHorizontal } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import styles from "./workspace-shell.module.css";

export type DesktopChromeState = { protocolVersion: 1; availableVersion: string | null };

declare global {
  interface Window { talentSignalDesktop?: DesktopChromeState }
}

// This metadata is presentation only. Native code owns source trust, checking and installation.
export function desktopVersion(state: unknown): string | null {
  if (!state || typeof state !== "object" || !("protocolVersion" in state) || state.protocolVersion !== 1 || !("availableVersion" in state)) return null;
  return typeof state.availableVersion === "string" && /^[\w.+() -]{1,40}$/.test(state.availableVersion)
    ? state.availableVersion : null;
}

function subscribe(callback: () => void) {
  window.addEventListener("talent-signal-desktop", callback);
  return () => window.removeEventListener("talent-signal-desktop", callback);
}
function snapshot() {
  const state = window.talentSignalDesktop;
  return state?.protocolVersion === 1 ? desktopVersion(state) ?? "connected" : null;
}
const serverSnapshot = () => null;

export function DesktopUpdateButton() {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!state || state === "connected") return null;
  return (
    <a aria-label={`查看 macOS ${state} 更新`} className={styles.desktopUpdate} href="talentsignal-desktop://updates" title={`新版本 ${state}`}>
      <ArrowDown aria-hidden="true" size={13} weight="bold" />
      <span>更新</span>
    </a>
  );
}

export function DesktopSettingsLink({ onClick }: { onClick: () => void }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!state) return null;
  return (
    <a href="talentsignal-desktop://settings" onClick={onClick}>
      <SlidersHorizontal aria-hidden="true" size={16} />
      <span>连接与调试</span>
      <kbd>⌘ ,</kbd>
    </a>
  );
}
