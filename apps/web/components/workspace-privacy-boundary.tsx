"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Do not mount history, directory, Lab or account chrome in the private room. */
export function WorkspacePrivacyBoundary({ children, privateContent }: {
  children: ReactNode; privateContent: ReactNode;
}) {
  return usePathname() === "/workspace/private"
    ? <div lang="zh-CN" className="ts-workspace-theme quiet-workspace">{privateContent}</div>
    : children;
}
