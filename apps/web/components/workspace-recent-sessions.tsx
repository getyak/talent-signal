"use client";

import { ChatCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  recentSessionRows,
} from "@/lib/workspace-recent-sessions";
import { useWorkspaceDirectory } from "./workspace-search";
import styles from "./workspace-shell.module.css";

/** A disposable directory projection, never a second Session store. */
export function WorkspaceRecentSessions({ binding }: { binding: string }) {
  const pathname = usePathname();
  const { data, loading, failed } = useWorkspaceDirectory(binding, true);
  const rows = data ? recentSessionRows(data.sessions, binding) : null;
  const current = !loading && !failed && rows
    ? { rows, state: "ready" as const }
    : failed ? { rows: [], state: "error" as const } : null;

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
