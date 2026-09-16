"use client";

import {
  CalendarBlank,
  ChatCircleDots,
  ClockCounterClockwise,
  Database,
  House,
  MagnifyingGlass,
  PlugsConnected,
  SidebarSimple,
  UserCircle,
} from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import styles from "./workspace-shell.module.css";

const items = [
  {
    href: "/workspace/today",
    icon: House,
    label: "今日",
    mobile: true,
    matches: (pathname: string) =>
      pathname === "/workspace/today" ||
      pathname.startsWith("/workspace/pursuits/"),
  },
  {
    href: "/workspace/sessions",
    icon: ClockCounterClockwise,
    label: "对话",
    mobile: true,
    matches: (pathname: string) => pathname.startsWith("/workspace/sessions"),
  },
  {
    href: "/workspace/people",
    icon: UserCircle,
    label: "联系人",
    mobile: true,
    matches: (pathname: string) => pathname.startsWith("/workspace/people"),
  },
  {
    href: "/workspace/meetings",
    icon: CalendarBlank,
    label: "会议",
    mobile: true,
    matches: (pathname: string) => pathname.startsWith("/workspace/meetings"),
  },
  {
    href: "/workspace/captures",
    icon: Database,
    label: "来源",
    mobile: false,
    matches: (pathname: string) => pathname.startsWith("/workspace/captures"),
  },
  {
    href: "/workspace/plugs",
    icon: PlugsConnected,
    label: "连接",
    mobile: false,
    matches: (pathname: string) => pathname.startsWith("/workspace/plugs"),
  },
] as const;

const COLLAPSED_KEY = "talent-signal:workspace-rail-collapsed";
const COLLAPSED_EVENT = "talent-signal:workspace-rail-preference";
let collapsedFallback = false;

function collapsedSnapshot() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return collapsedFallback;
  }
}

function subscribeToCollapsedPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_EVENT, onChange);
  };
}

export function WorkspaceShellNav() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedPreference,
    collapsedSnapshot,
    () => false,
  );

  function toggleCollapsed() {
    const next = !collapsed;
    collapsedFallback = next;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Keep this interaction usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(COLLAPSED_EVENT));
  }

  return (
    <div className={styles.navRegion} data-collapsed={collapsed}>
      <div className={styles.railTools}>
        <Link aria-label="搜索联系人" href="/workspace/people" title="搜索联系人">
          <MagnifyingGlass aria-hidden="true" size={18} />
          <span>搜索</span>
        </Link>
        <button
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-pressed={collapsed}
          onClick={toggleCollapsed}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          type="button"
        >
          <SidebarSimple aria-hidden="true" size={18} />
          <span>{collapsed ? "展开" : "收起"}</span>
        </button>
      </div>

      <nav aria-label="工作台导航" className={styles.navigation}>
        {items.map((item) => {
          const Icon = item.icon;
          const current = item.matches(pathname);
          return (
            <Link
              aria-current={current ? "page" : undefined}
              data-mobile-secondary={!item.mobile || undefined}
              href={item.href}
              key={item.label}
              title={collapsed ? item.label : undefined}
            >
              <Icon aria-hidden="true" size={19} weight="duotone" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function WorkspaceCaptureLink() {
  const pathname = usePathname();

  function focusAgent(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/workspace") {
      return;
    }
    const currentLocation = new URL(window.location.href);
    if (currentLocation.searchParams.get("surface") === "loading") {
      return;
    }
    event.preventDefault();
    window.history.pushState(
      null,
      "",
      "/workspace?surface=desk&intent=compose",
    );
    window.dispatchEvent(new Event("talent-signal:focus-agent"));
  }

  return (
    <Link
      aria-label="开始一条新的智能助理消息"
      className={styles.capture}
      href="/workspace?surface=desk&intent=compose"
      onClick={focusAgent}
    >
      <ChatCircleDots aria-hidden="true" size={19} weight="duotone" />
      <span>新建对话</span>
    </Link>
  );
}

export function WorkspaceMobileSourcesLink() {
  return (
    <Link
      aria-label="打开来源"
      className={styles.mobileSources}
      href="/workspace/captures"
      title="来源"
    >
      <Database aria-hidden="true" size={19} weight="duotone" />
      <span>来源</span>
    </Link>
  );
}
