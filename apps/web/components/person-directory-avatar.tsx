"use client";

import { useAvatarPreferences } from "./avatar-preferences-provider";
import { IdentityAvatar } from "./identity-avatar";

/** Shared recognition display; local choices never establish identity or trigger lookups. */
export function PersonDirectoryAvatar({ className, label, url, id, size, dataSize, self = false }: {
  className?: string; label: string; url?: string | null; id: string; size?: number; dataSize?: string; self?: boolean;
}) {
  const { store, defaultStyle, people } = useAvatarPreferences();
  return <IdentityAvatar className={className} id={self ? store?.key ?? id : id} label={label} url={url} size={size} dataSize={dataSize}
    defaultStyle={defaultStyle} preference={people[self ? "self" : `person:${id}`]} />;
}
