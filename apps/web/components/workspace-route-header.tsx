"use client";

import { usePathname } from "next/navigation";

import {
  isWorkspaceHomePath,
  workspaceRouteLabel,
} from "@/lib/workspace-navigation";
import styles from "./workspace-shell.module.css";

const SESSION_DETAIL = /^\/workspace\/sessions\/[^/]+$/u;

/**
 * The 58px route header. It states where the user is for directory surfaces.
 * A Session detail supplies all of its context in its own compact header, so
 * this shell header returns nothing there instead of repeating a crumb.
 */
export function WorkspaceRouteHeader() {
  const pathname = usePathname();

  if (SESSION_DETAIL.test(pathname)) return null;

  const label = workspaceRouteLabel(pathname);

  return (
    <header className={styles.routeHeader}>
      <div className={styles.crumb}>
        <strong>{isWorkspaceHomePath(pathname) ? "新对话" : label}</strong>
      </div>
    </header>
  );
}
