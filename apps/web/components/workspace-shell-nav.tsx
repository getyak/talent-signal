"use client";

import {
  CalendarBlank,
  ChatCircleDots,
  ClockCounterClockwise,
  Database,
  DotsThree,
  House,
  Plus,
  Plugs,
  SidebarSimple,
  Users,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type MouseEvent } from "react";

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

function useCollapsedState() {
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedPreference,
    collapsedSnapshot,
    () => false,
  );
  return {
    collapsed,
    setCollapsed(next: boolean) {
      collapsedFallback = next;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Keep this interaction usable when browser storage is unavailable.
      }
      window.dispatchEvent(new Event(COLLAPSED_EVENT));
    },
  };
}

function NavLink({
  collapsed,
  current,
  nested = false,
  route,
}: {
  collapsed: boolean;
  current: boolean;
  nested?: boolean;
  route: WorkspaceNavRoute;
}) {
  const NavigationIcon = NAV_ICONS[route.id];
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={styles.navLink}
      data-mobile={route.mobile ? "true" : "false"}
      data-nested={nested ? "true" : undefined}
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
        weight={current && route.id !== "home" ? "fill" : "regular"}
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
  const { collapsed, setCollapsed } = useCollapsedState();
  const activeRoute = workspaceNavRouteForPath(pathname);
  const primary = workspaceNavRoutes("primary");
  // On the compact dock the mobile secondary destinations appear directly; on
  // desktop the same routes live in the quieter More entry inside the
  // conversation/people hierarchy.
  const mobileSecondary = workspaceNavRoutes("secondary").filter(
    (route) => route.mobile,
  );

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
            onClick={() => setCollapsed(!collapsed)}
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
        <div className={styles.mobileOnlyGroup}>
          {mobileSecondary.map((route) => (
            <NavLink
              collapsed={collapsed}
              current={activeRoute?.id === route.id}
              key={`mobile-${route.id}`}
              route={route}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

/**
 * Supplementary destinations, one compact disclosure at the foot of the
 * conversation and people hierarchy. It opens itself while a supplementary
 * route is the current page, so the active destination is never hidden, and it
 * keeps native keyboard semantics: a named button, `aria-expanded`, Escape-free
 * dismissal through the same button, and visible focus.
 */
export function WorkspaceMoreDestinations() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useCollapsedState();
  const activeRoute = workspaceNavRouteForPath(pathname);
  const routes = workspaceNavRoutes("secondary");
  const activeIsNested = routes.some((route) => route.id === activeRoute?.id);
  // The disclosure follows the route until the user overrides it for that exact
  // page, so a supplementary destination is visible whenever it is current and
  // an explicit collapse is never undone by a re-render.
  const [override, setOverride] = useState<{
    pathname: string;
    open: boolean;
  } | null>(null);
  const open =
    override?.pathname === pathname ? override.open : activeIsNested;

  if (routes.length === 0) return null;

  return (
    <section aria-label="更多目的地" className={styles.moreFooter}>
      <button
        aria-expanded={open}
        className={styles.moreTrigger}
        onClick={() => {
          if (collapsed) {
            setCollapsed(false);
            setOverride({ pathname, open: true });
            return;
          }
          setOverride({ pathname, open: !open });
        }}
        type="button"
      >
        <DotsThree aria-hidden="true" size={17} weight="regular" />
        <span>更多</span>
        <span aria-hidden="true" className={styles.moreCaret}>
          {open ? "−" : "+"}
        </span>
      </button>
      <div className={styles.moreList} hidden={!open}>
        {routes.map((route) => (
          <NavLink
            collapsed={false}
            current={activeRoute?.id === route.id}
            key={route.id}
            nested
            route={route}
          />
        ))}
      </div>
    </section>
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
