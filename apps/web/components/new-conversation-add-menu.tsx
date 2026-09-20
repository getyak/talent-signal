"use client";

import { ArrowRight, FileImage, Plus, User } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import {
  sidebarPeopleFromDirectory,
  sidebarPersonHref,
} from "@/lib/workspace-sidebar";
import { useWorkspaceDirectory } from "./workspace-search";
import styles from "./new-conversation.module.css";

/**
 * The composer's compact add menu.
 *
 * It offers only actions this build really performs: opening the governed
 * screenshot importer, and opening an authorized person's living page. Choosing
 * a person never submits the conversation — the unsent objective stays in the
 * partitioned local draft, so returning to the canvas restores it.
 */
export function ComposerAddMenu({
  binding,
  onCapture,
  onNavigate,
}: {
  binding: string | null;
  onCapture: () => void;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const { data, loading, failed } = useWorkspaceDirectory(binding, open);
  const people = sidebarPeopleFromDirectory(data?.people, 8);
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  const matches = normalized
    ? people.filter((person) =>
        `${person.label} ${person.detail}`.toLocaleLowerCase().includes(normalized),
      )
    : people;

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => search.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: Event) {
      const target = event.target;
      if (
        target instanceof Node &&
        !panel.current?.contains(target) &&
        !trigger.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("focusin", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("focusin", closeFromOutside);
    };
  }, [open]);

  function close(returnFocus = false) {
    setOpen(false);
    setQuery("");
    if (returnFocus) trigger.current?.focus();
  }

  function moveFocus(direction: 1 | -1) {
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>("button, a[href], input") ?? [],
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      index === -1
        ? direction === 1
          ? 0
          : items.length - 1
        : (index + direction + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div className={styles.addAnchor}>
      <button
        aria-controls="composer-add-panel"
        aria-expanded={open}
        aria-label="添加截图或关联人物"
        className={styles.add}
        onClick={() => (open ? close() : setOpen(true))}
        ref={trigger}
        title="添加截图或关联人物"
        type="button"
      >
        <Plus aria-hidden="true" size={18} weight="bold" />
      </button>
      {open ? (
        <div
          className={styles.addMenu}
          id="composer-add-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close(true);
              return;
            }
            // Arrow keys move focus only outside the search field, so text
            // editing keeps the caret.
            const target = event.target as HTMLElement;
            if (target instanceof HTMLInputElement) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
          ref={panel}
        >
          <button
            className={styles.addAction}
            onClick={() => {
              close();
              onCapture();
            }}
            type="button"
          >
            <FileImage aria-hidden="true" size={17} weight="duotone" />
            <span>
              <strong>导入截图或图片</strong>
              <small>选择一份设备上的对话截图</small>
            </span>
          </button>
          <div className={styles.addDivider} />
          <p className={styles.addGroupLabel} id="add-menu-people">
            关联人物
          </p>
          <div className={styles.addSearch}>
            <User aria-hidden="true" size={15} />
            <input
              aria-label="查找人物"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="查找人物"
              ref={search}
              type="search"
              value={query}
            />
          </div>
          <div aria-labelledby="add-menu-people" className={styles.addPeople} role="group">            {loading ? (
              <p className={styles.addEmpty} role="status">
                正在读取账号目录…
              </p>
            ) : failed ? (
              <p className={styles.addEmpty}>
                人物目录暂时无法读取；这里不会用缓存或示例补齐。
              </p>
            ) : matches.length ? (
              matches.map((person) => (
                <button
                  className={styles.addPerson}
                  key={person.id}
                  onClick={() => {
                    close();
                    onNavigate(sidebarPersonHref(person));
                  }}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.addAvatar}>
                    {person.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" src={person.avatarUrl} />
                    ) : (
                      person.label.slice(0, 1)
                    )}
                  </span>
                  <span>
                    <strong>{person.label}</strong>
                    <small>{person.detail}</small>
                  </span>
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              ))
            ) : (
              <p className={styles.addEmpty}>
                {query ? "没有匹配的人物" : "还没有可关联的人物"}
              </p>
            )}
          </div>
          <p className={styles.addNote}>
            打开人物页面不会发出这条消息；未发送的内容会留在本机，可随时恢复。
          </p>
        </div>
      ) : null}
    </div>
  );
}
