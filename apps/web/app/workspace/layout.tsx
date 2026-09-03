import { SignOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { signOutOfWorkspace } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { TalentSignalLabShell } from "@/components/talent-signal-lab/lab-shell";
import {
  WorkspaceCaptureLink,
  WorkspaceShellNav,
} from "@/components/workspace-shell-nav";
import styles from "@/components/workspace-shell.module.css";
import { loadLabManifest } from "@/lib/server/labBackend";

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "TS"
  );
}

function AccountControls({
  accountName,
  fixtureWorkspace,
}: {
  accountName: string;
  fixtureWorkspace: boolean;
}) {
  return (
    <>
      <span aria-hidden="true" className={styles.avatar}>
        {initials(accountName)}
      </span>
      {fixtureWorkspace ? (
        <span
          className={styles.environmentBadge}
          title="合成测试工作台——仅含评测数据，不是真实招聘记录"
        >
          测试
        </span>
      ) : null}
      <div className={styles.accountControls}>
        <ThemeToggle />
        <form action={signOutOfWorkspace}>
          <button aria-label="退出登录" title="退出登录" type="submit">
            <SignOut aria-hidden="true" size={18} />
          </button>
        </form>
      </div>
    </>
  );
}

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  // Child pages retain the exact callback URL when authentication is missing.
  // Rendering no product chrome here lets their redirect remain authoritative.
  if (!session?.user) {
    return children;
  }

  const accountName = session.user.name ?? session.user.email ?? "招聘顾问";
  const backendAccount = (
    session as typeof session & {
      account?: { name: string; slug: string };
    }
  ).account;
  const fixtureFallback =
    !backendAccount && process.env.TALENT_SIGNAL_INTEGRATION_MODE === "true";
  const fixtureWorkspace =
    backendAccount?.slug.startsWith("fixture-") ?? fixtureFallback;
  const accountTitle = fixtureWorkspace
    ? `${accountName} · ${backendAccount?.name ?? "Alpha 寻访测试"} · 合成测试工作台`
    : `${accountName} · ${backendAccount?.name ?? "账号专属工作台"}`;
  let labManifest: Awaited<ReturnType<typeof loadLabManifest>> | null = null;
  try {
    labManifest = await loadLabManifest();
  } catch {
    // The product workspace stays available when the isolated Lab control
    // plane is unavailable. No synthetic fallback is shown as real state.
  }

  return (
    <div className={styles.shell}>
      <aside aria-label="Talent Signal 工作台" className={styles.rail}>
        <Link
          aria-label="Talent Signal 今日"
          className={styles.brand}
          href="/workspace/today"
        >
          <span aria-hidden="true">TS</span>
        </Link>
        <WorkspaceShellNav />
        <WorkspaceCaptureLink />
        <div className={styles.account} title={accountTitle}>
          <AccountControls
            accountName={accountName}
            fixtureWorkspace={fixtureWorkspace}
          />
        </div>
      </aside>

      <header className={styles.mobileHeader}>
        <Link
          aria-label="Talent Signal 今日"
          className={styles.brand}
          href="/workspace/today"
        >
          <span aria-hidden="true">TS</span>
        </Link>
        <div className={styles.mobileAccount} title={accountTitle}>
          <AccountControls
            accountName={accountName}
            fixtureWorkspace={fixtureWorkspace}
          />
        </div>
      </header>

      <TalentSignalLabShell initialManifest={labManifest}>
        <div className={styles.stage} id="workspace-content">
          {children}
        </div>
      </TalentSignalLabShell>
    </div>
  );
}
