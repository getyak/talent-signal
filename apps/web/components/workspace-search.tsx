"use client";

import {
  ChatCircle,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  searchWorkspaceResults,
  isWorkspaceSearchShortcut,
  type WorkspaceSearchPerson,
  type WorkspaceSearchSession,
} from "@/lib/workspace-search";
import { WORKSPACE_SESSION_EXPIRED_EVENT, workspaceSessionFetch } from "./workspace-session-request";
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
  expires_at?: unknown;
};

type SessionResponse = {
  sessions?: SessionRow[];
  session_version?: unknown;
};

function cleanLabel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type DirectorySnapshot = { people: DirectoryResponse; sessions: SessionResponse };

/** A directory response is publishable only after both bodies are decoded and
 * the exact credential binding has been verified. Abort also covers body reads. */
export async function readWorkspaceDirectory(
  binding: string,
  signal: AbortSignal,
  request: typeof workspaceSessionFetch = workspaceSessionFetch,
): Promise<DirectorySnapshot | null> {
  const responses = await Promise.all([
    request("/api/local-integration/people", { cache: "no-store", signal }),
    request("/api/workspace-sessions", { cache: "no-store", signal }),
  ]);
  if (signal.aborted) return null;
  if (responses.some(response => !response.ok)) throw new Error("Directory unavailable");
  const [people, sessions] = await Promise.all(responses.map(response => response.json()));
  if (signal.aborted) return null;
  if (!binding || sessions?.session_version !== binding ||
      !Array.isArray(people?.people) || !Array.isArray(sessions?.sessions)) {
    throw new Error("Directory binding unavailable");
  }
  return { people, sessions };
}

export function activeDirectorySessions(payload: SessionResponse, now = Date.now()): SessionResponse {
  return { ...payload, sessions: (payload.sessions ?? []).filter(row =>
    row.state === "active" && typeof row.expires_at === "string" && Date.parse(row.expires_at) > now) };
}

/** Disposable, bound data shared by search and the persistent people sidebar. */
export function useWorkspaceDirectory(binding: string | null, enabled: boolean) {
  const pathname = usePathname();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const retry = useCallback(() => setRefreshVersion(value => value + 1), []);
  const [result, setResult] = useState<{ binding: string; data: DirectorySnapshot | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !binding) return;
    let controller: AbortController | null = null;
    let disposed = false;
    let expired = false;
    async function refresh() {
      controller?.abort();
      if (disposed || expired) return;
      const request = new AbortController();
      controller = request;
      setResult(null);
      try {
        const data = await readWorkspaceDirectory(binding!, request.signal);
        if (disposed || request.signal.aborted || !data) return;
        setResult({ binding: binding!, data, failed: false });
      } catch {
        if (!disposed && !request.signal.aborted) setResult({ binding: binding!, data: null, failed: true });
      }
    }
    function invalidate() {
      expired = true;
      controller?.abort();
      setResult({ binding: binding!, data: null, failed: true });
    }
    function visible() {
      if (document.visibilityState === "visible") void refresh();
      else { controller?.abort(); setResult(null); }
    }
    window.addEventListener(WORKSPACE_SESSION_EXPIRED_EVENT, invalidate);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener(WORKSPACE_SESSION_EXPIRED_EVENT, invalidate);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [binding, enabled, pathname, refreshVersion]);
  useEffect(() => {
    if (!enabled || result?.binding !== binding || !result?.data) return;
    const expirations = (result.data.sessions.sessions ?? []).map(row =>
      typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN).filter(Number.isFinite);
    if (!expirations.length) return;
    const timer = window.setTimeout(() => setResult(current => current?.data && current.binding === binding
      ? { ...current, data: { ...current.data, sessions: activeDirectorySessions(current.data.sessions) } } : current),
    Math.min(2_147_483_647, Math.max(0, Math.min(...expirations) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [result, binding, enabled]);
  const current = enabled && binding && result?.binding === binding ? result : null;
  return { data: current?.data ? { ...current.data, sessions: activeDirectorySessions(current.data.sessions) } : null,
    loading: Boolean(enabled && binding && !current), failed: current?.failed ?? !binding, retry };
}

/** Real account-scoped People directory projection; never a fixture. */
export function useWorkspaceSearchSources(binding: string | null, enabled: boolean) {
  const { data, loading, failed, retry } = useWorkspaceDirectory(binding, enabled);
  const people: WorkspaceSearchPerson[] = (data?.people.people ?? []).flatMap(person => {
    const id = cleanLabel(person.id), label = cleanLabel(person.display_label);
    return id && label ? [{ id, label, detail: cleanLabel(person.contexts?.[0]?.display_label) || "联系人",
      avatarUrl: cleanLabel(person.avatar?.url) || null }] : [];
  });
  const sessions: WorkspaceSearchSession[] = (data?.sessions.sessions ?? []).flatMap(row => {
    const id = cleanLabel(row.session_id), title = cleanLabel(row.title);
    return id && title ? [{ id, title, detail: [cleanLabel(row.person_label), cleanLabel(row.context_label)].filter(Boolean).join(" · ") || "账号专属对话" }] : [];
  });
  return { people, sessions, loading, failed, retry };
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
  const { people, sessions, loading, failed, retry } = useWorkspaceSearchSources(
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
        !event.isComposing && isWorkspaceSearchShortcut(event)
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
        title={`${label} · ⌘K / Ctrl+K`}
        type="button"
      >
        <MagnifyingGlass aria-hidden="true" size={17} />
      </button>
      <dialog
        aria-label="搜索人物与对话"
        className={styles.searchDialog}
        onClose={() => { setOpen(false); setQuery(""); trigger.current?.focus(); }}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
              (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          const links = Array.from(dialog.current?.querySelectorAll<HTMLAnchorElement>("[data-search-result]") ?? []);
          if (!links.length) return;
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          if (document.activeElement !== input.current && index < 0) return;
          event.preventDefault();
          const next = index < 0 ? (event.key === "ArrowDown" ? 0 : links.length - 1)
            : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
          links[next]?.focus();
          links[next]?.scrollIntoView({ block: "nearest" });
        }}
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
              输入姓名、机构或对话标题。
            </p>
          ) : loading ? (
            <p className={styles.searchEmpty} role="status">
              正在读取当前账号的目录…
            </p>
          ) : failed ? (
            <div className={styles.searchEmpty} role="alert">
              <p>暂时无法读取人物与对话。请重试，已保存的内容不会丢失。</p>
              <button className={styles.searchRetry} onClick={retry} type="button">重新载入</button>
            </div>
          ) : results.total === 0 ? (
            <p className={styles.searchEmpty} role="status">没有找到“{query.trim()}”。试试姓名的一部分或机构名称。</p>
          ) : (
            <>
              {results.people.length ? (
                <>
                  <p className={styles.searchSection}>人物</p>
                  {results.people.map((person) => (
                    <Link
                      className={styles.searchResult}
                      data-search-result=""
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
                      data-search-result=""
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
        <p className={styles.searchHint}>↑ ↓ 选择 · Enter 打开 · Esc 关闭</p>
      </dialog>
    </>
  );
}
