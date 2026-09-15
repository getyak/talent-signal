/**
 * Quiet shared theme tokens.
 *
 * These are CSS custom properties, not a component library. Values follow the
 * design handoff `DESIGN.md` primitive contract (content-first, neutral,
 * restrained vermilion redline, no ornamental chrome). Hosts may override any
 * token; the shared surface only depends on the names below.
 *
 * Scope: `.ts-workspace-surface` (applied by NativeCapabilityWorkbench).
 */
export const WORKSPACE_SURFACE_CLASS = "ts-workspace-surface";

export const quietTheme = {
  accent: "#b94632",
  chromeMuted: "#707571",
  chromeSurface: "#f5f5f3",
  contentSurface: "#fdfdfc",
  divider: "#e7e8e5",
  ink: "#292b2b",
  panelSurface: "#ffffff",
  radius: { control: "6px", frame: "8px" },
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", xxl: "32px" },
  type: { body: "14px", meta: "12px", nav: "13px", title: "24px" },
} as const;

export type QuietTheme = typeof quietTheme;
