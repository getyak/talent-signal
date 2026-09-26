"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAvatarStore, emptyAvatarPreferences, type AvatarStore } from "@/lib/avatar-preferences";

const Context = createContext<AvatarStore | null>(null);
const noopSubscribe = () => () => {};
const serverSnapshot = () => emptyAvatarPreferences;

export function AvatarPreferencesProvider({ scope, children }: { scope: string | null; children: ReactNode }) {
  return scope ? <BoundAvatarPreferences key={scope} scope={scope}>{children}</BoundAvatarPreferences> : children;
}

function BoundAvatarPreferences({ scope, children }: { scope: string; children: ReactNode }) {
  const [store] = useState(() => createAvatarStore(scope, () => window.localStorage));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === store.key) store.refresh(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useAvatarPreferences() {
  const store = useContext(Context);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getSnapshot ?? serverSnapshot, serverSnapshot);
  return { store, ...snapshot };
}
