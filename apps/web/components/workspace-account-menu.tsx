"use client";

import { SignOut } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { ThemeToggle } from "./theme-toggle";
import { clearAllPendingMeetingDraftIntents } from "@/lib/meeting-draft-pending";
import styles from "./workspace-shell.module.css";

const links = [
  ["/workspace/settings", "账号与安全"],
  ["/workspace/settings?section=workspace", "工作空间管理"],
] as const;

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "TS"
  );
}

export function WorkspaceAccountMenu({
  accountName,
  signOutAction,
}: {
  accountName: string;
  signOutAction: (formData: FormData) => void | Promise<void>;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);

  function close(returnFocus = false) {
    if (menu.current) menu.current.open = false;
    if (returnFocus) trigger.current?.focus();
  }

  function moveFocus(key: "ArrowDown" | "ArrowUp" | "End" | "Home") {
    const items = Array.from(
      popover.current?.querySelectorAll<HTMLElement>(
        "a[href],button:not([disabled])",
      ) ?? [],
    );
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let index: number;
    if (key === "Home") index = 0;
    else if (key === "End") index = items.length - 1;
    else if (current === -1) index = key === "ArrowUp" ? items.length - 1 : 0;
    else if (key === "ArrowDown") index = (current + 1) % items.length;
    else index = (current - 1 + items.length) % items.length;
    items[index]?.focus();
  }

  useEffect(() => {
    const closeFromOutside = (event: Event) => {
      const target = event.target;
      if (
        menu.current?.open &&
        target instanceof Node &&
        !menu.current.contains(target)
      ) {
        close();
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("focusin", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("focusin", closeFromOutside);
    };
  }, []);

  return (
    <details
      className={styles.accountMenu}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        } else if (
          menu.current?.open &&
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          moveFocus(event.key as "ArrowDown" | "ArrowUp" | "End" | "Home");
        }
      }}
      ref={menu}
    >
      <summary
        aria-label="账号与空间"
        className={styles.avatar}
        ref={trigger}
        title="账号与空间"
      >
        {initials(accountName)}
      </summary>
      <div aria-label="账号与空间操作" className={styles.accountPopover} ref={popover}>
        <strong>{accountName}</strong>
        {links.map(([href, label]) => (
          <Link href={href} key={href} onClick={() => close()}>
            {label}
          </Link>
        ))}
        <span className={styles.accountLanguage}>
          <span>语言</span>
          <strong lang="zh-CN">简体中文</strong>
        </span>
        <span className={styles.accountAppearance}>
          <span>外观</span>
          <ThemeToggle label="切换工作区明暗主题" />
        </span>
        <hr />
        <Link href="/workspace/plugs" onClick={() => close()}>连接与权限</Link>
        <Link href="/workspace/monitor" onClick={() => close()}>运行反馈</Link>
        <form action={signOutAction} onSubmit={clearAllPendingMeetingDraftIntents}>
          <button type="submit">
            <SignOut aria-hidden="true" size={17} />
            退出登录
          </button>
        </form>
      </div>
    </details>
  );
}
