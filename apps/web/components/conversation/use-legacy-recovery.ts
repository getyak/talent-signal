"use client";

import { useEffect, useState } from "react";

import {
  readLegacyConversationRecovery,
  type LegacyConversationRecovery,
} from "@/lib/conversation-legacy";

type ScopedRecovery = {
  scope: string;
  value: LegacyConversationRecovery | null;
};

/**
 * Read the account-scoped legacy conversation-home recovery after hydration and
 * keep it honest for as long as it lives.
 *
 * The record is re-read when another tab changes this account partition, and it
 * clears itself at its own original `expiresAt`. Nothing here polls, extends,
 * rewrites or deletes the record; the existing reader stays the only authority.
 */
export function useLegacyConversationRecovery(
  storageScope: string | null,
): LegacyConversationRecovery | null {
  const [state, setState] = useState<ScopedRecovery | null>(null);

  useEffect(() => {
    if (!storageScope) return;
    const scope = storageScope;
    let current = true;
    const refresh = () => {
      if (current) setState({ scope, value: readLegacyConversationRecovery(scope) });
    };
    // Defer past the effect body so the read never cascades a render.
    queueMicrotask(refresh);
    const onStorage = (event: StorageEvent) => {
      if (!current) return;
      // `null` means the whole store was cleared; otherwise only this account
      // partition can change the record we are showing.
      if (event.key !== null && !event.key.includes(scope)) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      current = false;
      window.removeEventListener("storage", onStorage);
    };
  }, [storageScope]);

  const active = state && state.scope === storageScope ? state.value : null;

  useEffect(() => {
    if (!storageScope || !active) return;
    const scope = storageScope;
    let current = true;
    const refresh = () => {
      queueMicrotask(() => {
        if (current) setState({ scope, value: readLegacyConversationRecovery(scope) });
      });
    };
    const remaining = Date.parse(active.expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    // One bounded timer for this record's own expiry; never extended here.
    const timer = setTimeout(refresh, Math.max(0, remaining) + 50);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [storageScope, active]);

  return active;
}
