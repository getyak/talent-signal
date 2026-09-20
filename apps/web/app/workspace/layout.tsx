import "@/components/workspace-theme.css";

import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { signOutOfWorkspace } from "@/app/login/actions";
import { TalentSignalLabShell } from "@/components/talent-signal-lab/lab-shell";
import {
  WorkspaceCaptureLink,
  WorkspaceMobileSourcesLink,
  WorkspaceShellNav,
} from "@/components/workspace-shell-nav";
import { WorkspaceRecentSessions } from "@/components/workspace-recent-sessions";
import styles from "@/components/workspace-shell.module.css";
import {
  readBackendSessionClaims,
  readPrimaryBackendSessionClaims,
} from "@/lib/server/backendAuth";
import {
  TEST_WORKSPACE_COOKIE,
  testWorkspaceSession,
} from "@/lib/server/testWorkspaceSession";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { leaveTestWorkspace } from "@/app/workspace/settings/testing/actions";
import accountStyles from "@/components/account-settings.module.css";
import { SystemHealthProvider } from "@/components/system-health-provider";
import { WorkspaceAccountMenu } from "@/components/workspace-account-menu";
import { MeetingDraftSessionBoundary } from "@/components/meeting-draft-session-boundary";
import { SessionDraftSessionBoundary } from "@/components/session-draft-session-boundary";
import {
  workspaceSessionDraftStorageScope,
  workspaceSessionsBinding,
} from "@/lib/server/workspaceSessions";

function AccountControls({
  accountName,
  fixtureWorkspace,
}: {
  accountName: string;
  fixtureWorkspace: boolean;
}) {
  return (
    <>
      <WorkspaceAccountMenu
        accountName={accountName}
        signOutAction={signOutOfWorkspace}
      />
      {fixtureWorkspace ? (
        <span
          className={styles.environmentBadge}
          title="合成测试工作台——仅含评测数据，不是真实招聘记录"
        >
          测试
        </span>
      ) : null}
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
    return <>
      <MeetingDraftSessionBoundary sessionVersion={null} />
      <SessionDraftSessionBoundary storageScope={null} />
      {children}
    </>;
  }

  let testName: string | null = null;
  try {
    const primary = await readPrimaryBackendSessionClaims();
    if (primary) testName = (await testWorkspaceSession(primary))?.name ?? null;
  } catch { testName = "测试会话已过期"; }
  // The rendered scope must come from the effective backend session, never from
  // account settings: a settings outage must not unbind the rendered workspace.
  let scope: string | null = null;
  let pendingBinding: string | null = null;
  let pendingSessionDraftScope: string | null = null;
  let backendAccount: {name:string;slug:string} | null = null;
  try {
    const claims = await readBackendSessionClaims();
    if (claims && !backendSessionIsExpired(claims.backendExpiresAt)) {
      scope = claims.backendAccountId;
      pendingBinding = workspaceSessionsBinding(claims);
      pendingSessionDraftScope = workspaceSessionDraftStorageScope(claims);
      backendAccount = {name:claims.backendAccountName,slug:claims.backendAccountSlug};
    }
  } catch { /* Scope mismatch or unreadable test session: stay unbound. */ }
  const hasTestWorkspace = (await cookies()).has(TEST_WORKSPACE_COOKIE);
  if (!scope) {
    return <>
      <MeetingDraftSessionBoundary sessionVersion={null} />
      <SessionDraftSessionBoundary storageScope={null} />
      <section className={accountStyles.section} aria-live="polite">
        <h1>需要重新确认登录空间</h1>
        <p className={accountStyles.error}>登录空间已变化或会话已过期，暂不能显示工作区内容。</p>
        {hasTestWorkspace ? <form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form>
          : <Link href="/login?reason=backend_session_expired">重新登录</Link>}
      </section>
    </>;
  }
  const accountName = session.user.name ?? session.user.email ?? "招聘顾问";
  const fixtureFallback =
    !backendAccount && process.env.TALENT_SIGNAL_INTEGRATION_MODE === "true";
  const fixtureWorkspace = Boolean(testName) || (backendAccount?.slug.startsWith("fixture-") ?? fixtureFallback);
  const workspaceName = backendAccount?.name;
  const accountTitle = fixtureWorkspace
    ? `${accountName} · ${workspaceName ?? "Alpha 寻访测试"} · 合成测试工作台`
    : `${accountName} · ${workspaceName ?? "账号专属工作台"}`;

  return (
    <div className={`ts-workspace-theme quiet-workspace ${styles.shell}`}>
      {pendingBinding ? (
        <MeetingDraftSessionBoundary sessionVersion={pendingBinding} />
      ) : null}
      <SessionDraftSessionBoundary storageScope={pendingSessionDraftScope} />
      <aside aria-label="Talent Signal 工作台" className={styles.rail}>
        <Link
          aria-label="Talent Signal 今日"
          className={styles.brand}
          href="/workspace/today"
        >
          <span aria-hidden="true">TS</span>
          <strong>Talent Signal</strong>
        </Link>
        <WorkspaceShellNav />
        <WorkspaceCaptureLink />
        {pendingBinding ? <WorkspaceRecentSessions key={pendingBinding} binding={pendingBinding} /> : null}
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
          <strong>Talent Signal</strong>
        </Link>
        <div className={styles.mobileAccount} title={accountTitle}>
          <WorkspaceMobileSourcesLink />
          <AccountControls
            accountName={accountName}
            fixtureWorkspace={fixtureWorkspace}
          />
        </div>
      </header>

      {/* Lab loads independently after hydration; it must not hold up product HTML. */}
      <TalentSignalLabShell initialManifest={null}>
        <div className={styles.stage} id="workspace-content" data-workspace-scope={scope} key={scope}>
          <SystemHealthProvider>
            {testName && <div className={accountStyles.banner} role="status"><span>测试空间 · {testName}</span><form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form></div>}
            {children}
          </SystemHealthProvider>
        </div>
      </TalentSignalLabShell>
    </div>
  );
}
