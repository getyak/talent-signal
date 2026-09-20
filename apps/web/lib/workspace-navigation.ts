/**
 * Pure route registry for the persistent workspace shell.
 *
 * Route identity, canonical hrefs, mobile placement and active-path matching
 * live here so the desktop rail, the compact mobile tab bar and any future
 * surface (command palette, breadcrumbs) read one authoritative inventory.
 * This module is intentionally free of React, Next.js and DOM concerns so it
 * stays cheap to unit test and safe to import from any runtime.
 */

export type WorkspaceNavRouteId =
  | "today"
  | "sessions"
  | "people"
  | "meetings"
  | "captures"
  | "plugs";

export type WorkspaceNavRoute = {
  readonly id: WorkspaceNavRouteId;
  /** Canonical link target. */
  readonly href: string;
  /** Visible label; also the collapsed-rail tooltip. */
  readonly label: string;
  /** Rendered in the compact mobile tab bar as well as the desktop rail. */
  readonly mobile: boolean;
  /** Path predicate used to derive `aria-current="page"`. */
  readonly matches: (pathname: string) => boolean;
};

/** Matches a base path exactly, or any nested path beneath it. */
export function workspacePathMatches(
  pathname: string,
  basePath: string,
): boolean {
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

/**
 * Ordered navigation inventory. Today owns Pursuit detail routes, which stay
 * visible as the active section even though they are not separate rail rows.
 */
export const WORKSPACE_NAV_ROUTES: readonly WorkspaceNavRoute[] = [
  {
    id: "today",
    href: "/workspace/today",
    label: "今日",
    mobile: true,
    matches: (pathname) =>
      workspacePathMatches(pathname, "/workspace/today") ||
      workspacePathMatches(pathname, "/workspace/pursuits"),
  },
  {
    id: "sessions",
    href: "/workspace/sessions",
    label: "对话",
    mobile: true,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/sessions"),
  },
  {
    id: "people",
    href: "/workspace/people",
    label: "联系人",
    mobile: true,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/people"),
  },
  {
    id: "meetings",
    href: "/workspace/meetings",
    label: "会议",
    mobile: true,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/meetings"),
  },
  {
    id: "captures",
    href: "/workspace/captures",
    label: "来源",
    mobile: false,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/captures"),
  },
  {
    id: "plugs",
    href: "/workspace/plugs",
    label: "连接",
    mobile: false,
    matches: (pathname) => workspacePathMatches(pathname, "/workspace/plugs"),
  },
];

/** Routes that fit the compact mobile tab bar, in rail order. */
export function workspaceMobileNavRoutes(): readonly WorkspaceNavRoute[] {
  return WORKSPACE_NAV_ROUTES.filter((route) => route.mobile);
}

/** The single active section for a pathname, or null outside the workspace. */
export function workspaceNavRouteForPath(
  pathname: string,
): WorkspaceNavRoute | null {
  return WORKSPACE_NAV_ROUTES.find((route) => route.matches(pathname)) ?? null;
}

/** Whether a specific route is the active section for a pathname. */
export function isWorkspaceNavRouteCurrent(
  route: WorkspaceNavRoute,
  pathname: string,
): boolean {
  return route.matches(pathname);
}

/** Same-route compose entry point used by the rail and the mobile chrome. */
export const WORKSPACE_COMPOSE_HREF = "/workspace?surface=desk&intent=compose";

/** DOM event that hands keyboard focus to the workspace Agent composer. */
export const WORKSPACE_FOCUS_AGENT_EVENT = "talent-signal:focus-agent";

export type WorkspaceCaptureIntent =
  | { readonly intercept: false }
  | {
      readonly intercept: true;
      readonly href: typeof WORKSPACE_COMPOSE_HREF;
      readonly event: typeof WORKSPACE_FOCUS_AGENT_EVENT;
    };

/**
 * The "new conversation" control is a same-route transition when the workspace
 * desk is already mounted, so it focuses the composer instead of remounting the
 * page. Everywhere else it should navigate normally. A loading surface must
 * never be intercepted: the composer may not exist yet.
 */
export function workspaceCaptureIntent(
  pathname: string,
  search: string,
): WorkspaceCaptureIntent {
  if (pathname !== "/workspace") return { intercept: false };
  const surface = new URLSearchParams(search).get("surface");
  if (surface === "loading") return { intercept: false };
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
