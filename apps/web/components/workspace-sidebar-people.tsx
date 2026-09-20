"use client";

import { ArrowSquareOut, CaretRight, ChatCircle, Users } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  relatedSessionsForPerson,
  sidebarPeopleFromDirectory,
  sidebarPersonHref,
  sidebarSessionRows,
  type SidebarPerson,
  type SidebarSessionRow,
} from "@/lib/workspace-sidebar";
import { workspaceSessionFetch } from "./workspace-session-request";
import styles from "./workspace-shell.module.css";

type SidebarDirectory = {
  people: SidebarPerson[];
  sessions: SidebarSessionRow[];
};

/**
 * Real people hierarchy: the authorized directory projection, plus the
 * sessions the canonical record already bound to each person. Names alone
 * never create a relationship row.
 */
export function WorkspaceSidebarPeople({ binding }: { binding: string | null }) {
  const [directory, setDirectory] = useState<SidebarDirectory | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      setState("loading");
      setDirectory(null);
      try {
        const [peopleResult, sessionResult] = await Promise.allSettled([
          workspaceSessionFetch("/api/local-integration/people", {
            cache: "no-store",
            signal: controller.signal,
          }),
          workspaceSessionFetch("/api/workspace-sessions", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (cancelled) return;
        if (peopleResult.status !== "fulfilled" || !peopleResult.value.ok) {
          setState("error");
          return;
        }
        const peoplePayload: unknown = await peopleResult.value.json();
        let sessions: SidebarSessionRow[] = [];
        if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
          const sessionPayload: unknown = await sessionResult.value.json();
          if (
            !binding ||
            (sessionPayload &&
              typeof sessionPayload === "object" &&
              "session_version" in sessionPayload &&
              (sessionPayload as { session_version?: unknown }).session_version ===
                binding)
          ) {
            sessions = sidebarSessionRows(sessionPayload);
          }
        }
        if (cancelled) return;
        setDirectory({
          people: sidebarPeopleFromDirectory(peoplePayload),
          sessions,
        });
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [binding]);

  const people = directory?.people ?? [];
  const sessions = directory?.sessions ?? [];

  return (
    <section aria-label="常用人物" className={styles.group}>
      <header className={styles.groupTitle}>
        <span>常用人物</span>
        <Link aria-label="查看全部人物" href="/workspace/people" title="查看全部人物">
          <ArrowSquareOut aria-hidden="true" size={13} />
        </Link>
      </header>
      {state === "loading" ? (
        <p className={styles.groupEmpty}>正在读取…</p>
      ) : state === "error" ? (
        <p className={styles.groupEmpty}>
          人物目录暂时无法读取；不会用缓存或示例补齐。
        </p>
      ) : people.length === 0 ? (
        <p className={styles.groupEmpty}>
          <Users aria-hidden="true" size={13} /> 还没有联系人
        </p>
      ) : (
        <div className={styles.personList}>
          {people.map((person) => {
            const isExpanded = expanded === person.id;
            const related = relatedSessionsForPerson(sessions, person.id);
            return (
              <div
                className={styles.personRow}
                data-expanded={isExpanded ? "true" : undefined}
                key={person.id}
              >
                <div className={styles.personRowHead}>
                  <button
                    aria-expanded={isExpanded}
                    className={styles.personDisclosure}
                    onClick={() =>
                      setExpanded(isExpanded ? null : person.id)
                    }
                    title={`展开 ${person.label} 的相关对话`}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={styles.avatar}
                      data-size="small"
                    >
                      {person.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={person.avatarUrl} />
                      ) : (
                        person.label.slice(0, 1)
                      )}
                    </span>
                    <span className={styles.personSummary}>
                      <strong>{person.label}</strong>
                      <small>{person.detail}</small>
                    </span>
                    <CaretRight
                      aria-hidden="true"
                      className={styles.personCaret}
                      size={11}
                    />
                  </button>
                  <Link
                    aria-label={`查看 ${person.label} 的人物资料`}
                    className={styles.iconButton}
                    href={sidebarPersonHref(person)}
                    title={`查看 ${person.label} 的人物资料`}
                  >
                    <ArrowSquareOut aria-hidden="true" size={14} />
                  </Link>
                </div>
                {isExpanded ? (
                  <div
                    aria-label={`${person.label} 的最近相关对话`}
                    className={styles.personConversations}
                  >
                    {related.length ? (
                      related.map((session) => (
                        <Link
                          className={styles.personConversation}
                          href={`/workspace/sessions/${session.id}`}
                          key={session.id}
                          title={session.title}
                        >
                          <ChatCircle aria-hidden="true" size={12} />
                          <span>{session.title}</span>
                        </Link>
                      ))
                    ) : (
                      <p>暂无相关对话</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
