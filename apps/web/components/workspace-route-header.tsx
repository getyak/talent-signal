"use client";

import { CaretRight } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isWorkspaceHomePath,
  workspaceRouteLabel,
} from "@/lib/workspace-navigation";
import styles from "./workspace-shell.module.css";

const SESSION_DETAIL = /^\/workspace\/sessions\/[^/]+$/u;

/**
 * The 58px route header. It states where the user is, in the same order the
 * sidebar presents: a parent section crumb and the current destination. It
 * carries no actions, so nothing consequential competes with the page itself.
 */
export function WorkspaceRouteHeader() {
  const pathname = usePathname();
  const label = workspaceRouteLabel(pathname);
  const sessionDetail = SESSION_DETAIL.test(pathname);

  return (
    <header className={styles.routeHeader}>
      <div className={styles.crumb}>
        {sessionDetail ? (
          <>
            <Link href="/workspace/sessions">全部对话</Link>
            <CaretRight aria-hidden="true" size={11} />
            <strong>对话</strong>
          </>
        ) : (
          <strong>{isWorkspaceHomePath(pathname) ? "新对话" : label}</strong>
        )}
      </div>
    </header>
  );
}
