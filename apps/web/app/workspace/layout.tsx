import { SignOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { signOutOfWorkspace } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  WorkspaceCaptureLink,
  WorkspaceShellNav,
} from "@/components/workspace-shell-nav";
import styles from "@/components/workspace-shell.module.css";

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
          title="Synthetic fixture workspace — evaluation data, not live recruiter records"
        >
          Fixture
        </span>
      ) : null}
      <div className={styles.accountControls}>
        <ThemeToggle />
        <form action={signOutOfWorkspace}>
          <button aria-label="Sign out" title="Sign out" type="submit">
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

  const accountName = session.user.name ?? session.user.email ?? "Recruiter";
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
    ? `${accountName} · ${backendAccount?.name ?? "Fixture Alpha Search"} · synthetic fixture workspace`
    : `${accountName} · ${backendAccount?.name ?? "account-scoped workspace"}`;

  return (
    <div className={styles.shell}>
      <aside aria-label="Talent Signal workspace" className={styles.rail}>
        <Link
          aria-label="Talent Signal Today"
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
          aria-label="Talent Signal Today"
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

      <div className={styles.stage} id="workspace-content">
        {children}
      </div>
    </div>
  );
}
