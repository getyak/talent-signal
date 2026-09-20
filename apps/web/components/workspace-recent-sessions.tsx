"use client";

import { ChatCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  recentSessionRows,
  unexpiredRecentSessions,
  type RecentSession,
} from "@/lib/workspace-recent-sessions";
import {
  WORKSPACE_SESSION_EXPIRED_EVENT,
  workspaceSessionFetch,
} from "./workspace-session-request";
import styles from "./workspace-shell.module.css";

/** A disposable directory projection, never a second Session store. */
export function WorkspaceRecentSessions({ binding }: { binding: string }) {
  const pathname = usePathname();
  const [result, setResult] = useState<{
    binding: string;
    rows: RecentSession[];
    state: "ready" | "error";
  } | null>(null);

  useEffect(() => {
    let controller: AbortController | null = null;
    let expired = false;
    async function refresh() {
      controller?.abort();
      if (expired) return;
      const request = new AbortController();
      controller = request;
      setResult(null);
      try {
        const response = await workspaceSessionFetch("/api/workspace-sessions", {
          signal: request.signal,
          cache: "no-store",
        });
        const payload: unknown = await response.json();
        if (request.signal.aborted) return;
        const rows = response.ok ? recentSessionRows(payload, binding) : null;
        setResult({ binding, rows: rows ?? [], state: rows ? "ready" : "error" });
      } catch {
        if (!request.signal.aborted) {
          setResult({ binding, rows: [], state: "error" });
        }
      }
    }
    function invalidate() {
      expired = true;
      controller?.abort();
      setResult({ binding, rows: [], state: "error" });
    }
    function visible() {
      if (document.visibilityState === "visible") void refresh();
      else {
        controller?.abort();
        setResult(null);
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(WORKSPACE_SESSION_EXPIRED_EVENT, invalidate);
    // Expiration and remote deletions are re-read, never kept as durable chrome.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(WORKSPACE_SESSION_EXPIRED_EVENT, invalidate);
    };
  }, [binding, pathname]);

  useEffect(() => {
    if (!result?.rows.length || result.binding !== binding) return;
    const nextExpiry = Math.min(...result.rows.map((row) => row.expiresAt));
    const timeout = window.setTimeout(
      () => {
        setResult((current) =>
          current && current.binding === binding
            ? { ...current, rows: unexpiredRecentSessions(current.rows) }
            : current,
        );
      },
      Math.min(Math.max(0, nextExpiry - Date.now()), 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [result, binding]);

  const current = result?.binding === binding ? result : null;

  return (
    <section aria-label="最近对话" className={styles.group}>
      <header className={styles.groupTitle}>
        <span>对话</span>
        <Link href="/workspace/sessions">全部</Link>
      </header>
      {current?.state === "ready" ? (
        current.rows.length ? (
          <ul className={styles.rowList}>
            {current.rows.map((row) => (
              <li key={row.id}>
                <Link
                  aria-current={
                    pathname === `/workspace/sessions/${row.id}`
                      ? "page"
                      : undefined
                  }
                  className={styles.sessionRow}
                  href={`/workspace/sessions/${row.id}`}
                  title={row.title}
                >
                  <span
                    aria-hidden="true"
                    className={styles.sessionDot}
                    data-unread={row.unread ? "true" : "false"}
                  />
                  <span>{row.title}</span>
                  {row.unread ? <small>未读</small> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.groupEmpty}>
            <ChatCircle aria-hidden="true" size={13} /> 还没有对话
          </p>
        )
      ) : (
        <p className={styles.groupEmpty}>
          {current?.state === "error"
            ? "暂时无法读取，打开全部对话重试"
            : "正在读取…"}
        </p>
      )}
    </section>
  );
}
