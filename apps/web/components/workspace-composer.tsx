"use client";

import { ArrowRight } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  COMPOSER_DISCOVERY_HINT,
  composerDescribedBy,
  composerLengthState,
  composerMentionInsertion,
  composerMenuA11y,
  detectComposerTrigger,
  filterSlashCommands,
  insertComposerText,
  resolveComposerKey,
  type SlashCommand,
} from "@/lib/workspace-composer";
import {
  searchSidebarPeople,
  type SidebarPerson,
} from "@/lib/workspace-sidebar";
import { useWorkspaceDirectory } from "./workspace-search";
import styles from "./workspace-composer.module.css";

type MenuItem = {
  id: string;
  title: string;
  detail: string;
  kind: "starter" | "navigate" | "capture" | "mention";
  command?: SlashCommand;
  person?: SidebarPerson;
};

export type WorkspaceComposerProps = {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  /** `home` bounds at the send limit; `session` keeps the larger draft limit. */
  variant: "home" | "session";
  /** Submission is actually possible right now. */
  canSubmit: boolean;
  /** Suggestions are offered only while the surface can still act. */
  suggestionsEnabled?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  rows?: number;
  /** Extra id appended to `aria-describedby` (e.g. a status line). */
  describedBy?: string;
  /** Workspace Sessions binding used for the `@` directory, only while open. */
  binding: string | null;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onNavigate: (href: string) => void;
  onCapture?: () => void;
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
};

/**
 * The one composer shared by the conversation canvas and the Session workbench.
 *
 * It owns caret-aware `/` and `@` suggestions, bounded auto-growth, the
 * discovery hint and the length meter. Parent surfaces keep their own stores,
 * send rules and footer actions; this component never submits by itself.
 */
export function WorkspaceComposer({
  id,
  label,
  value,
  maxLength,
  placeholder,
  variant,
  canSubmit,
  suggestionsEnabled = true,
  disabled = false,
  readOnly = false,
  rows = 2,
  describedBy,
  binding,
  onValueChange,
  onSubmit,
  onNavigate,
  onCapture,
  footerStart,
  footerEnd,
}: WorkspaceComposerProps) {
  const base = useId();
  const menuId = `${base}-menu`;
  const hintId = `${base}-hint`;
  const meterId = `${base}-meter`;
  const mentionNoteId = `${base}-mention`;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [overflowSignature, setOverflowSignature] = useState<string | null>(null);

  const active = suggestionsEnabled && !disabled && !readOnly;
  const trigger = useMemo(
    () => (active ? detectComposerTrigger(value, caret) : null),
    [active, caret, value],
  );
  const mentionOpen = trigger?.kind === "mention";
  const directory = useWorkspaceDirectory(binding, mentionOpen);

  const commands =
    trigger?.kind === "slash" ? filterSlashCommands(trigger.query) : [];
  const people =
    trigger?.kind === "mention" && directory.data
      ? searchSidebarPeople(directory.data.people, trigger.query, 8)
      : [];

  const items: MenuItem[] =
    trigger?.kind === "slash"
      ? commands.map((command) => ({
          id: `slash-${command.id}`,
          title: command.title,
          detail: command.description,
          kind: command.kind,
          command,
        }))
      : people.map((person) => ({
          id: `person-${person.id}`,
          title: person.label,
          detail: person.detail,
          kind: "mention" as const,
          person,
        }));

  const signature = trigger ? `${trigger.kind}\u0000${value}` : null;
  const menuOpen = Boolean(
    active &&
      trigger &&
      dismissed !== signature &&
      (trigger.kind === "mention" || items.length > 0),
  );
  const activeItem = items.length
    ? items[Math.min(activeIndex, items.length - 1)]
    : undefined;
  const highlighted = items.length
    ? Math.min(activeIndex, items.length - 1)
    : 0;
  // Overflow is tied to the exact token that could not be inserted. Editing the
  // value changes the signature, so the notice clears without an effect.
  const overflowNotice =
    overflowSignature !== null && overflowSignature === signature;
  const lengthState = composerLengthState(value.length, {
    // Session keeps the 12,000-character draft limit; every surface sends at 1,000.
    sendLimit:
      variant === "home" && maxLength < 1_000 ? maxLength : undefined,
  });

  // Auto-grow to a bounded scroll area; a long paste cannot overflow layout.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    const viewport =
      typeof window === "undefined" ? 0 : Math.round(window.innerHeight * 0.4);
    const limit =
      variant === "session" ? Math.max(viewport, 220) : Math.max(viewport, 200);
    const next = Math.max(82, Math.min(element.scrollHeight, limit));
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight > limit ? "auto" : "hidden";
  }, [value, variant]);

  // Keep DOM focus and the caret inside the textarea after a suggestion edit.
  useLayoutEffect(() => {
    const element = textarea.current;
    const next = pendingCaret.current;
    if (element && next !== null) {
      pendingCaret.current = null;
      element.focus({ preventScroll: true });
      element.setSelectionRange(next, next);
      setCaret(next);
    }
  }, [value]);

  const syncCaret = useCallback(
    (event: { currentTarget: HTMLTextAreaElement }) => {
      const element = event.currentTarget;
      if (typeof element.selectionStart === "number") {
        setCaret(element.selectionStart);
      }
    },
    [],
  );

  const retryDirectory = useCallback(() => {
    // Re-runs the same bound refresh the shell performs on window focus.
    if (typeof window !== "undefined") window.dispatchEvent(new Event("focus"));
  }, []);

  function close() {
    if (trigger) setDismissed(`${trigger.kind}\u0000${value}`);
  }

  function choose(item: MenuItem | undefined) {
    if (!trigger || !item) return;
    if (item.kind === "navigate" && item.command?.href) {
      close();
      onNavigate(item.command.href);
      return;
    }
    if (item.kind === "capture") {
      close();
      if (onCapture) onCapture();
      else if (item.command?.href) onNavigate(item.command.href);
      return;
    }
    const insert =
      item.kind === "mention" && item.person
        ? composerMentionInsertion(item.person)
        : item.command?.insert;
    if (!insert) return;
    const result = insertComposerText({
      value,
      start: trigger.start,
      end: trigger.end,
      insert,
      maxLength,
    });
    if (!result.inserted) {
      setOverflowSignature(signature);
      return;
    }
    setOverflowSignature(null);
    pendingCaret.current = result.caret;
    setCaret(result.caret);
    onValueChange(result.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = resolveComposerKey({
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode,
      menuOpen,
      canSubmit,
    });
    if (action === "next") {
      event.preventDefault();
      if (items.length) setActiveIndex((index) => (index + 1) % items.length);
    } else if (action === "previous") {
      event.preventDefault();
      if (items.length) {
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
      }
    } else if (action === "choose") {
      // Selecting a suggestion never submits the draft.
      event.preventDefault();
      choose(activeItem);
    } else if (action === "dismiss") {
      event.preventDefault();
      close();
    } else if (action === "submit") {
      event.preventDefault();
      onSubmit();
    }
  }

  function renderItem(item: MenuItem, index: number) {
    const selected = menuOpen && index === highlighted;
    return (
      <div
        aria-selected={selected}
        className={styles.item}
        data-kind={item.kind}
        data-selected={selected ? "true" : undefined}
        id={`${menuId}-option-${index}`}
        key={item.id}
        onClick={() => choose(item)}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        role="option"
      >
        <span className={styles.itemText}>
          <strong>{item.title}</strong>
          <small>{item.detail}</small>
        </span>
        {item.kind === "mention" ? (
          <span className={styles.tag}>引用</span>
        ) : item.kind === "starter" ? (
          <span className={styles.tag}>草稿</span>
        ) : (
          <ArrowRight aria-hidden="true" size={14} />
        )}
      </div>
    );
  }

  const describedByIds = composerDescribedBy([
    describedBy,
    hintId,
    meterId,
    menuOpen && trigger?.kind === "mention" ? mentionNoteId : null,
  ]);

  return (
    <div className={styles.composer} data-variant={variant}>
      {menuOpen && trigger ? (
        <div className={styles.menu}>
          <div
            aria-label={composerMenuA11y(trigger.kind).listboxLabel}
            className={styles.list}
            id={menuId}
            role="listbox"
          >
            {trigger.kind === "slash" ? (
              items.map((item, index) => renderItem(item, index))
            ) : directory.loading ? (
              <p className={styles.state} role="status">
                正在读取账号目录…
              </p>
            ) : directory.failed ? (
              <div className={styles.state}>
                <p>人物目录暂时无法读取；这里不会用缓存或示例补齐。</p>
                <button
                  className={styles.retry}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={retryDirectory}
                  type="button"
                >
                  重试
                </button>
              </div>
            ) : items.length ? (
              items.map((item, index) => renderItem(item, index))
            ) : (
              <p className={styles.state}>
                {trigger.query ? "没有匹配的人物" : "还没有人物"}
              </p>
            )}
          </div>
          {composerMenuA11y(trigger.kind).disclosure ? (
            <p className={styles.disclosure} id={mentionNoteId}>
              {composerMenuA11y(trigger.kind).disclosure}
            </p>
          ) : null}
          {overflowNotice ? (
            <p className={styles.overflow} role="status">
              插入后会超过 {maxLength} 字上限，草稿未被修改。
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        aria-activedescendant={
          menuOpen && items.length ? `${menuId}-option-${highlighted}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={menuOpen ? menuId : undefined}
        aria-describedby={describedByIds || undefined}
        disabled={disabled}
        id={id}
        maxLength={maxLength}
        onChange={(event) => {
          syncCaret(event);
          // A new edit restarts the highlighted suggestion from the top.
          setActiveIndex(0);
          onValueChange(event.target.value);
        }}
        onClick={syncCaret}
        onFocus={syncCaret}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        placeholder={placeholder}
        readOnly={readOnly}
        ref={textarea}
        rows={rows}
        value={value}
      />

      <div className={styles.footer}>
        <div className={styles.footerStart}>
          {footerStart}
          <span className={styles.hint} id={hintId}>
            {COMPOSER_DISCOVERY_HINT}
          </span>
          {lengthState.message ? (
            <span
              className={styles.meter}
              data-level={lengthState.level}
              id={meterId}
              role="status"
            >
              {lengthState.message}
            </span>
          ) : (
            <span className="sr-only" id={meterId}>
              还可输入 {lengthState.remainingToSend} 字
            </span>
          )}
        </div>
        <div className={styles.footerEnd}>{footerEnd}</div>
      </div>
    </div>
  );
}
