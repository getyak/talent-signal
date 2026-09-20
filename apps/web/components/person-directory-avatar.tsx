"use client";

import { useState } from "react";

/** A confirmed directory avatar; no inferred image or external lookup. */
export function PersonDirectoryAvatar({ className, label, url }: {
  className: string; label: string; url: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const words = label.trim().split(/\s+/);
  const initials = (words.length > 1
    ? words.slice(0, 2).map(word => Array.from(word)[0]).join("")
    : Array.from(label.trim()).slice(0, 2).join("")).toUpperCase() || "?";
  return (
    <span aria-hidden="true" className={className}>
      {url && url !== failedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- confirmed provider URL, no image proxy retention.
        <img alt="" src={url} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : initials}
    </span>
  );
}
