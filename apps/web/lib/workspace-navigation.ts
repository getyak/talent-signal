/**
 * Pure route registry for the persistent workspace shell.
 *
 * Route identity, canonical hrefs, mobile placement and active-path matching
 * live here so the desktop rail, the compact mobile tab bar and the route
 * header read one authoritative inventory. This module is intentionally free
 * of React, Next.js and DOM concerns so it stays cheap to unit test and safe
 * to import from any runtime.
 *
 * The Quiet Workspace composition keeps four primary destinations (new
 * conversation, people, calendar, plugs) at full visual weight, and demotes
 * Today, the session directory and Sources to a secondary group that is still
 * reachable without competing with the conversation.
 */

export type WorkspaceNavRouteId =
  | "home"
  | "people"
  | "meetings"
  | "plugs"
  | "today"
  | "sessions"
  | "captures";

export type WorkspaceNavSection = "primary" | "secondary";

export type WorkspaceNavRoute = {
  readonly id: WorkspaceNavRouteId;
  /** Canonical link target. */
  readonly href: string;
  /** Visible label; also the collapsed-rail tooltip. */
  readonly label: string;
  /** Visual group in the sidebar. */
  readonly section: WorkspaceNavSection;
  /** Rendered in the compact mobile tab bar as well as the desktop rail. */
  readonly mobile: boolean;
  /** Path predicate used to derive `aria-current="page"`. */
  readonly matches: (pathname: string) => boolean;
};

/** Matches a base path exactly, or any nested path beneath it. */
export function workspacePathMatches(
  pathname: string | null | undefined,
  basePath: string,
): boolean {
  if (typeof pathname !== "string") return false;
  if (pathname === basePath) return true;
  const normalize = (value: string) =>
    value.endsWith("/") && value !== "/" ? value.slice(0, -1) : value;
  const normalizedPathname = normalize(pathname);
  const normalizedBase = normalize(basePath);
  return (
    normalizedPathname === normalizedBase ||
    normalizedPathname.startsWith(`${normalizedBase}/`)
  );
}

/** The unscoped conversation canvas is the default entry point. */
export function isWorkspaceHomePath(pathname: string | null | undefined): boolean {
  return pathname === "/workspace" || pathname === "/workspace/";
}

/**
 * Ordered navigation inventory. Today owns Pursuit detail routes, which stay
 * visible as the active section even though they are not separate rail rows.
 */
export const WORKSPACE_NAV_ROUTES: readonly WorkspaceNavRoute[] = [
  {
    id: "home",
    href: "/workspace",
    label: "新对话",
    section: "primary",
    mobile: true,
    matches: (pathname) => isWorkspaceHomePath(pathname),
  },
  {
    id: "people",
    href: "/workspace/people",
    label: "人物",
    section: "primary",
    mobile: true,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/people"),
  },
  {
    id: "meetings",
    href: "/workspace/meetings",
    label: "日程",
    section: "primary",
    mobile: true,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/meetings"),
  },
  {
    id: "plugs",
    href: "/workspace/plugs",
    label: "连接",
    section: "primary",
    mobile: false,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/plugs"),
  },
  {
    id: "today",
    href: "/workspace/today",
    label: "今日",
    section: "secondary",
    mobile: true,
    matches: (pathname) =>
      workspacePathMatches(pathname, "/workspace/today") ||
      workspacePathMatches(pathname, "/workspace/pursuits"),
  },
  {
    id: "sessions",
    href: "/workspace/sessions",
    label: "全部对话",
    section: "secondary",
    mobile: false,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/sessions"),
  },
  {
    id: "captures",
    href: "/workspace/captures",
    label: "来源",
    section: "secondary",
    mobile: false,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/captures"),
  },
];

/** Routes that fit the compact mobile tab bar, in rail order. */
export function workspaceMobileNavRoutes(): readonly WorkspaceNavRoute[] {
  return WORKSPACE_NAV_ROUTES.filter((route) => route.mobile);
}

export function workspaceNavRoutes(
  section: WorkspaceNavSection,
): readonly WorkspaceNavRoute[] {
  return WORKSPACE_NAV_ROUTES.filter((route) => route.section === section);
}

/** The single active section for a pathname, or null outside the workspace. */
export function workspaceNavRouteForPath(
  pathname: string | null | undefined,
): WorkspaceNavRoute | null {
  if (typeof pathname !== "string") return null;
  return WORKSPACE_NAV_ROUTES.find((route) => route.matches(pathname)) ?? null;
}

/** Whether a specific route is the active section for a pathname. */
export function isWorkspaceNavRouteCurrent(
  route: WorkspaceNavRoute,
  pathname: string,
): boolean {
  return route.matches(pathname);
}

/** Same-route compose entry point used by the scoped relationship desk. */
export const WORKSPACE_COMPOSE_HREF = "/workspace?surface=desk&intent=compose";

/** DOM event that hands keyboard focus to the workspace Agent composer. */
export const WORKSPACE_FOCUS_AGENT_EVENT = "talent-signal:focus-agent";

/** DOM event that resets the home canvas to a fresh conversation. */
export const WORKSPACE_NEW_CONVERSATION_EVENT =
  "talent-signal:new-conversation";

export type WorkspaceCaptureIntent =
  | { readonly intercept: false }
  | {
      readonly intercept: true;
      readonly href: typeof WORKSPACE_COMPOSE_HREF;
      readonly event: typeof WORKSPACE_FOCUS_AGENT_EVENT;
    };

/**
 * The scoped "new conversation" control is a same-route transition when the
 * relationship desk is already mounted, so it focuses the desk composer
 * instead of remounting the page. The unscoped home canvas owns its own
 * composer and must navigate normally. A loading surface must never be
 * intercepted: the composer may not exist yet.
 */
export function workspaceCaptureIntent(
  pathname: string,
  search: string,
): WorkspaceCaptureIntent {
  if (!isWorkspaceHomePath(pathname)) return { intercept: false };
  const surface = new URLSearchParams(search).get("surface");
  if (surface !== "desk") return { intercept: false };
  return {
    intercept: true,
    href: WORKSPACE_COMPOSE_HREF,
    event: WORKSPACE_FOCUS_AGENT_EVENT,
  };
}

/** Storage key for the collapsed desktop rail preference. */
export const WORKSPACE_RAIL_COLLAPSED_KEY =
  "talent-signal:workspace-rail-collapsed";

/** Same-tab notification event for collapsed-rail preference changes. */
export const WORKSPACE_RAIL_PREFERENCE_EVENT =
  "talent-signal:workspace-rail-preference";

/** Crumb label for the 58px route header, derived from the active route. */
export function workspaceRouteLabel(
  pathname: string | null | undefined,
): string {
  if (isWorkspaceHomePath(pathname)) return "新对话";
  if (workspacePathMatches(pathname, "/workspace/pursuits")) return "今日";
  return workspaceNavRouteForPath(pathname)?.label ?? "工作台";
}
