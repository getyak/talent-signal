/**
 * Settings section schema.
 *
 * Kept free of React and `"use client"` so the server route can validate its
 * query parameter and the client frame can render the same navigation. A pure
 * predicate imported from a client component would throw at runtime when a
 * Server Component calls it, which typecheck alone cannot catch.
 */

export const SETTINGS_SECTIONS = [
  { id: "account", label: "账号与安全", href: "/workspace/settings" },
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
