import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { leaveTestWorkspace } from "@/app/workspace/settings/testing/actions";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import styles from "@/components/account-settings.module.css";

export default async function ContactAgentLayout({ children }: { children: ReactNode }) {
  const scope = await readBackendSessionClaims().catch(() => null);
  if (!scope || backendSessionIsExpired(scope.backendExpiresAt)) {
    // The canonical workspace owns expired-test-cookie and sign-in recovery.
    redirect("/workspace/today");
  }
  return <div data-workspace-scope={scope.backendAccountId}>
    {scope.backendAccountSlug.startsWith("lab-") && <div className={styles.banner}>
      <span>测试空间 · {scope.backendAccountName}</span>
      <form action={leaveTestWorkspace}><button type="submit">返回我的空间</button></form>
    </div>}
    {children}
  </div>;
}
