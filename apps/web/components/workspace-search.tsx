"use client";

import {
  ChatCircle,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  searchWorkspaceResults,
  type WorkspaceSearchPerson,
  type WorkspaceSearchSession,
} from "@/lib/workspace-search";
import { workspaceSessionFetch } from "./workspace-session-request";
import styles from "./workspace-shell.module.css";

type DirectoryResponse = {
  people?: Array<{
    id?: unknown;
    display_label?: unknown;
    avatar?: { url?: unknown } | null;
    contexts?: Array<{ display_label?: unknown }>;
  }>;
};

type SessionRow = {
  session_id?: unknown;
  title?: unknown;
  state?: unknown;
  person_label?: unknown;
  context_label?: unknown;
  updated_at?: unknown;
};

type SessionResponse = {
  sessions?: SessionRow[];
  session_version?: unknown;
};

function cleanLabel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Real account-scoped People directory projection; never a fixture. */
export function useWorkspaceSearchSources(
  binding: string | null,
  enabled: boolean,
) {
  const [people, setPeople] = useState<WorkspaceSearchPerson[]>([]);
  const [sessions, setSessions] = useState<WorkspaceSearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setFailed(false);
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
      let nextPeople: WorkspaceSearchPerson[] = [];
      let nextSessions: WorkspaceSearchSession[] = [];
      let anyFailed = false;
      if (peopleResult.status === "fulfilled" && peopleResult.value.ok) {
        try {
          const payload = (await peopleResult.value.json()) as DirectoryResponse;
          nextPeople = (payload.people ?? [])
            .map((person) => {
              const id = cleanLabel(person.id);
              const label = cleanLabel(person.display_label);
              if (!id || !label) return null;
              const context = cleanLabel(person.contexts?.[0]?.display_label);
              const avatar = cleanLabel(person.avatar?.url);
              return {
                id,
                label,
                detail: context || "联系人",
                avatarUrl: avatar || null,
              } satisfies WorkspaceSearchPerson;
            })
            .filter((person): person is WorkspaceSearchPerson => person !== null);
        } catch {
          anyFailed = true;
        }
      } else {
        anyFailed = true;
      }
      if (sessionResult.status === "fulfilled" && sessionResult.value.ok) {
        try {
          const payload = (await sessionResult.value.json()) as SessionResponse;
          const bound = !binding || payload.session_version === binding;
          if (!bound) {
            anyFailed = true;
          } else {
            nextSessions = (payload.sessions ?? [])
              .filter((row) => row.state === "active")
              .map((row) => {
                const id = cleanLabel(row.session_id);
                const title = cleanLabel(row.title);
                if (!id || !title) return null;
                const scope = [
                  cleanLabel(row.person_label),
                  cleanLabel(row.context_label),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return {
                  id,
                  title,
                  detail: scope || "账号专属对话",
                } satisfies WorkspaceSearchSession;
              })
              .filter(
                (session): session is WorkspaceSearchSession => session !== null,
              );
          }
        } catch {
          anyFailed = true;
        }
      } else {
        anyFailed = true;
      }
      setPeople(nextPeople);
      setSessions(nextSessions);
      setFailed(anyFailed);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [binding, enabled]);

  return { people, sessions, loading, failed };
}

/**
 * One real global search surface over the authorized People directory and the
 * account's Session directory. It reads existing endpoints, keeps keyboard
 * semantics native and never claims a result the backend did not return.
 */
export function WorkspaceGlobalSearchDialog({
  binding,
  label = "搜索",
}: {
  binding: string | null;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { people, sessions, loading, failed } = useWorkspaceSearchSources(
    binding,
    open,
  );
  const results = searchWorkspaceResults({ people, sessions, query });

  const show = useCallback(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    setOpen(true);
    element.showModal();
    setQuery("");
    window.requestAnimationFrame(() => input.current?.focus());
  }, []);

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (
        !typing &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        // The shell mounts one trigger per breakpoint; only the visible one
        // owns the shortcut, so a hidden modal never opens.
        if (!trigger.current || trigger.current.offsetParent === null) return;
        event.preventDefault();
        show();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show]);

  const hasQuery = query.normalize("NFKC").trim().length > 0;

  return (
    <>
      <button
        aria-label={label}
        className={styles.iconButton}
        onClick={show}
        ref={trigger}
        title={label}
        type="button"
      >
        <MagnifyingGlass aria-hidden="true" size={17} />
      </button>
      <dialog
        aria-label="搜索人物与对话"
        className={styles.searchDialog}
        onClose={() => setQuery("")}
        ref={dialog}
      >
        <div className={styles.searchDialogHeader}>
          <MagnifyingGlass aria-hidden="true" size={17} />
          <input
            aria-label="搜索人物与对话"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索人物与对话"
            ref={input}
            type="search"
            value={query}
          />
          <button
            aria-label="关闭搜索"
            className={`${styles.iconButton} ${styles.searchClose}`}
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <div className={styles.searchResults}>
          {!hasQuery ? (
            <p className={styles.searchEmpty}>
              输入姓名、机构或对话标题。结果只来自当前账号已授权的目录。
            </p>
          ) : loading ? (
            <p className={styles.searchEmpty} role="status">
              正在读取当前账号的目录…
            </p>
          ) : results.total === 0 ? (
            <p className={styles.searchEmpty}>
              {failed
                ? "目录暂时无法读取；这里不会用缓存或示例结果补齐。"
                : "没有匹配的人物或对话。"}
            </p>
          ) : (
            <>
              {results.people.length ? (
                <>
                  <p className={styles.searchSection}>人物</p>
                  {results.people.map((person) => (
                    <Link
                      className={styles.searchResult}
                      href={`/workspace?person=${encodeURIComponent(person.id)}`}
                      key={person.id}
                      onClick={close}
                    >
                      <span
                        aria-hidden="true"
                        className={styles.avatar}
                        data-size="row"
                      >
                        {person.label.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{person.label}</strong>
                        <small>{person.detail}</small>
                      </span>
                    </Link>
                  ))}
                </>
              ) : null}
              {results.sessions.length ? (
                <>
                  <p className={styles.searchSection}>对话</p>
                  {results.sessions.map((session) => (
                    <Link
                      className={styles.searchResult}
                      href={`/workspace/sessions/${encodeURIComponent(session.id)}`}
                      key={session.id}
                      onClick={close}
                    >
                      <ChatCircle aria-hidden="true" size={17} />
                      <span>
                        <strong>{session.title}</strong>
                        <small>{session.detail}</small>
                      </span>
                    </Link>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
