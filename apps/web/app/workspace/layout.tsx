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
import { loadAccountSettings } from "@/lib/server/accountBackend";
import { readPrimaryBackendSessionClaims } from "@/lib/server/backendAuth";
import { testWorkspaceSession } from "@/lib/server/testWorkspaceSession";
import { leaveTestWorkspace } from "@/app/workspace/settings/testing/actions";
import accountStyles from "@/components/account-settings.module.css";
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
      <details className={styles.accountMenu}>
        <summary aria-label="账号与空间" title="账号与空间" className={styles.avatar}>{initials(accountName)}</summary>
        <div className={styles.accountPopover}>
          <strong>{accountName}</strong>
          <Link href="/workspace/settings">账号与安全</Link>
          <Link href="/workspace/settings?section=workspace">工作空间管理</Link>
          <Link href="/workspace/settings/testing">测试空间</Link>
        </div>
      </details>
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

  let settings: Awaited<ReturnType<typeof loadAccountSettings>> | null = null;
  let testName: string | null = null;
  try {
    const primary = await readPrimaryBackendSessionClaims();
    if (primary) testName = (await testWorkspaceSession(primary))?.name ?? null;
  } catch { testName = "测试会话已过期"; }
  try { settings = await loadAccountSettings(); } catch { /* Keep navigation available during account service failure. */ }
  const accountName = settings?.user.display_name ?? session.user.name ?? session.user.email ?? "招聘顾问";
  const backendAccount = (
    session as typeof session & {
      account?: { name: string; slug: string };
    }
  ).account;
  const fixtureFallback =
    !backendAccount && process.env.TALENT_SIGNAL_INTEGRATION_MODE === "true";
  const fixtureWorkspace = Boolean(testName) || (settings?.workspace.is_test ?? backendAccount?.slug.startsWith("fixture-") ?? fixtureFallback);
  const workspaceName = settings?.workspace.name ?? backendAccount?.name;
  const accountTitle = fixtureWorkspace
    ? `${accountName} · ${workspaceName ?? "Alpha 寻访测试"} · 合成测试工作台`
    : `${accountName} · ${workspaceName ?? "账号专属工作台"}`;
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
        <div className={styles.stage} id="workspace-content" data-workspace-scope={settings?.workspace.id} key={settings?.workspace.id}>
          {testName && <div className={accountStyles.banner} role="status"><span>测试空间 · {testName}</span><form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form></div>}
          {children}
        </div>
      </TalentSignalLabShell>
    </div>
  );
}
