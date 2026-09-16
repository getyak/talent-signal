import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WorkspacePlugs } from "@/components/workspace-plugs";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import { loadAccountSettings } from "@/lib/server/accountBackend";
import {
  webWorkspaceConnections,
  type WorkspaceConnection,
} from "@/lib/workspace-plugs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "账号连接、权限范围和失效状态。",
  robots: { follow: false, index: false },
  title: "连接与权限 · Talent Signal",
};

export default async function PlugsPage() {
  if (!(await auth())?.user) {
    redirect("/login?callbackUrl=%2Fworkspace%2Fplugs");
  }

  let connections: WorkspaceConnection[] = [];
  let error: string | null = null;
  try {
    connections = webWorkspaceConnections(await loadAccountSettings());
  } catch (caught) {
    if (isBackendSessionExpiredError(caught)) {
      redirect(backendSessionRecoveryHref("/workspace/plugs"));
    }
    error = "账号服务或后端暂时不可用。";
  }

  return <WorkspacePlugs connections={connections} error={error} />;
}
