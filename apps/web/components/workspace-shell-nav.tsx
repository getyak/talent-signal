"use client";

import {
  CalendarBlank,
  ChatCircleDots,
  ClockCounterClockwise,
  Database,
  House,
  Plugs,
  Plus,
  SidebarSimple,
  Users,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type MouseEvent } from "react";

import {
  WORKSPACE_COMPOSE_HREF,
  WORKSPACE_FOCUS_AGENT_EVENT,
  WORKSPACE_NEW_CONVERSATION_EVENT,
  WORKSPACE_NAV_ROUTES,
  WORKSPACE_RAIL_COLLAPSED_KEY,
  WORKSPACE_RAIL_PREFERENCE_EVENT,
  type WorkspaceNavRoute,
  type WorkspaceNavRouteId,
  workspaceCaptureIntent,
  workspaceNavRouteForPath,
  workspaceNavRoutes,
} from "@/lib/workspace-navigation";

import { WorkspaceGlobalSearchDialog } from "./workspace-search";
import styles from "./workspace-shell.module.css";

/** Presentation-only icon per route; route identity/hrefs live in the lib. */
const NAV_ICONS: Record<WorkspaceNavRouteId, Icon> = {
  home: Plus,
  people: Users,
  meetings: CalendarBlank,
  plugs: Plugs,
  today: House,
  sessions: ClockCounterClockwise,
  captures: Database,
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

function NavLink({
  collapsed,
  current,
  route,
}: {
  collapsed: boolean;
  current: boolean;
  route: WorkspaceNavRoute;
}) {
  const NavigationIcon = NAV_ICONS[route.id];
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={styles.navLink}
      data-mobile={route.mobile ? "true" : "false"}
      data-primary-action={route.id === "home" ? "true" : undefined}
      href={route.href}
      key={route.id}
      onClick={
        route.id === "home"
          ? () => window.dispatchEvent(new Event(WORKSPACE_NEW_CONVERSATION_EVENT))
          : undefined
      }
      title={collapsed ? route.label : undefined}
    >
      <NavigationIcon
        aria-hidden="true"
        className={styles.navIcon}
        size={17}
        weight={current ? "fill" : "regular"}
      />
      <span>{route.label}</span>
    </Link>
  );
}

export function WorkspaceShellNav({
  binding,
}: {
  binding: string | null;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedPreference,
    collapsedSnapshot,
    () => false,
  );
  const activeRoute = workspaceNavRouteForPath(pathname);
  const primary = workspaceNavRoutes("primary");
  const secondary = workspaceNavRoutes("secondary");

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
    <div
      className={styles.sidebarState}
      data-collapsed={collapsed}
    >
      <div className={styles.brandRow}>
        <Link
          aria-label="Talent Signal 工作台"
          className={styles.brand}
          href="/workspace"
        >
          <span aria-hidden="true" className={styles.brandMark} />
          <span className={styles.brandName}>Talent Signal</span>
        </Link>
        <div className={styles.brandActions}>
          <WorkspaceGlobalSearchDialog binding={binding} />
          <button
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-pressed={collapsed}
            className={styles.iconButton}
            onClick={toggleCollapsed}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            type="button"
          >
            <SidebarSimple aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      <nav aria-label="工作台导航" className={styles.nav}>
        <div className={styles.navGroup}>
          {primary.map((route) => (
            <NavLink
              collapsed={collapsed}
              current={activeRoute?.id === route.id}
              key={route.id}
              route={route}
            />
          ))}
        </div>
        <div className={styles.navGroup}>
          <p className={styles.navGroupLabel}>更多</p>
          {secondary.map((route) => (
            <NavLink
              collapsed={collapsed}
              current={activeRoute?.id === route.id}
              key={route.id}
              route={route}
            />
          ))}
        </div>
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
      aria-label="在当前关系情境中继续对话"
      className={styles.navLink}
      href={WORKSPACE_COMPOSE_HREF}
      onClick={focusAgent}
    >
      <ChatCircleDots aria-hidden="true" size={17} />
      <span>围绕此人对话</span>
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

/** Shared route inventory for tests and the route header. */
export const WORKSPACE_SHELL_ROUTES = WORKSPACE_NAV_ROUTES;
