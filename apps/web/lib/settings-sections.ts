/**
 * Settings section schema.
 *
 * Kept free of React and `"use client"` so the server route can validate its
 * query parameter and the client frame can render the same navigation. A pure
 * predicate imported from a client component would throw at runtime when a
 * Server Component calls it, which typecheck alone cannot catch.
 *
 * `overview` is the default page: one narrow column that explains the real
 * account, appearance and connection choices before deeper pages. Every other
 * section is a drilldown reached from that overview or from the compact
 * section row.
 */

export const SETTINGS_SECTIONS = [
  { id: "overview", label: "设置", href: "/workspace/settings" },
  { id: "account", label: "账号与安全", href: "/workspace/settings?section=account" },
  { id: "workspace", label: "工作空间", href: "/workspace/settings?section=workspace" },
  { id: "appearance", label: "外观与偏好", href: "/workspace/settings?section=appearance" },
  { id: "connections", label: "连接与权限", href: "/workspace/settings?section=connections" },
  { id: "advanced", label: "高级", href: "/workspace/settings?section=advanced" },
  { id: "testing", label: "测试与诊断", href: "/workspace/settings?section=testing" },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export function isSettingsSection(
  value: string | undefined | null,
): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

/**
 * Sections shown in the drilldown row. The overview is reachable through its
 * back link, and internal testing stays conditional on the build or workspace.
 */
export function settingsDrilldownSections(labEnabled: boolean) {
  return SETTINGS_SECTIONS.filter(
    (section) =>
      section.id !== "overview" &&
      (section.id !== "testing" || labEnabled),
  );
}
