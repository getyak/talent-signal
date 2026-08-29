"use client";

import {
  ChatCircleDots,
  ChartLine,
  House,
  Sparkle,
  UserCircle,
} from "@phosphor-icons/react";
import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./workspace-shell.module.css";

const items = [
  {
    href: "/workspace/today",
    icon: House,
    label: "今日",
    matches: (pathname: string) =>
      pathname === "/workspace/today" ||
      pathname.startsWith("/workspace/pursuits/"),
  },
  {
    href: "/workspace?surface=desk",
    icon: Sparkle,
    label: "智能助理",
    matches: (pathname: string) => pathname === "/workspace",
  },
  {
    href: "/workspace/people",
    icon: UserCircle,
    label: "联系人",
    matches: (pathname: string) => pathname.startsWith("/workspace/people"),
  },
  {
    href: "/workspace/evals",
    icon: ChartLine,
    label: "评测",
    matches: (pathname: string) => pathname.startsWith("/workspace/evals"),
  },
] as const;

export function WorkspaceShellNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="工作台导航" className={styles.navigation}>
      {items.map((item) => {
        const Icon = item.icon;
        const current = item.matches(pathname);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            href={item.href}
            key={item.label}
          >
            <Icon aria-hidden="true" size={20} weight="duotone" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceCaptureLink() {
  const pathname = usePathname();

  function focusAgent(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/workspace") {
      return;
    }
    const currentLocation = new URL(window.location.href);
    if (currentLocation.searchParams.get("surface") === "loading") {
      return;
    }
    event.preventDefault();
    window.history.pushState(
      null,
      "",
      "/workspace?surface=desk&intent=compose",
    );
    window.dispatchEvent(new Event("talent-signal:focus-agent"));
  }

  return (
    <Link
      aria-label="开始一条新的智能助理消息"
      className={styles.capture}
      href="/workspace?surface=desk&intent=compose"
      onClick={focusAgent}
    >
      <ChatCircleDots aria-hidden="true" size={20} weight="duotone" />
      <span>新建</span>
    </Link>
  );
}
