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
import type { Icon } from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  WORKSPACE_COMPOSE_HREF,
  WORKSPACE_FOCUS_AGENT_EVENT,
  WORKSPACE_NAV_ROUTES,
  WORKSPACE_RAIL_COLLAPSED_KEY,
  WORKSPACE_RAIL_PREFERENCE_EVENT,
  type WorkspaceNavRouteId,
  workspaceCaptureIntent,
  workspaceNavRouteForPath,
} from "@/lib/workspace-navigation";

import styles from "./workspace-shell.module.css";

/** Presentation-only icon per route; route identity/hrefs live in the lib. */
const NAV_ICONS: Record<WorkspaceNavRouteId, Icon> = {
  today: House,
  sessions: ClockCounterClockwise,
  people: UserCircle,
  meetings: CalendarBlank,
  captures: Database,
  plugs: PlugsConnected,
};

const COLLAPSED_KEY = WORKSPACE_RAIL_COLLAPSED_KEY;
const COLLAPSED_EVENT = WORKSPACE_RAIL_PREFERENCE_EVENT;
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
  const activeRoute = workspaceNavRouteForPath(pathname);

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
          <MagnifyingGlass aria-hidden="true" size={17} />
          <span>搜索</span>
        </Link>
        <button
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-pressed={collapsed}
          onClick={toggleCollapsed}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          type="button"
        >
          <SidebarSimple aria-hidden="true" size={17} />
          <span>{collapsed ? "展开" : "收起"}</span>
        </button>
      </div>

      <nav aria-label="工作台导航" className={styles.navigation}>
        {WORKSPACE_NAV_ROUTES.map((route) => {
          const NavigationIcon = NAV_ICONS[route.id];
          const current = activeRoute?.id === route.id;
          return (
            <Link
              aria-current={current ? "page" : undefined}
              data-mobile-secondary={!route.mobile || undefined}
              href={route.href}
              key={route.id}
              title={collapsed ? route.label : undefined}
            >
              <NavigationIcon aria-hidden="true" size={18} weight="duotone" />
              <span>{route.label}</span>
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
    const intent = workspaceCaptureIntent(pathname, window.location.search);
    if (!intent.intercept) {
      return;
    }
    event.preventDefault();
    window.history.pushState(null, "", intent.href);
    window.dispatchEvent(new Event(WORKSPACE_FOCUS_AGENT_EVENT));
  }

  return (
    <Link
      aria-label="开始一条新的智能助理消息"
      className={styles.capture}
      href={WORKSPACE_COMPOSE_HREF}
      onClick={focusAgent}
    >
      <ChatCircleDots aria-hidden="true" size={18} weight="duotone" />
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
      <Database aria-hidden="true" size={18} weight="duotone" />
      <span>来源</span>
    </Link>
  );
}
