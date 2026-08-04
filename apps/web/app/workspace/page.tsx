import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { IntegratedWorkspaceApp } from "@/components/integrated-workspace-app";
import { WorkspaceApp } from "@/components/workspace-app";
import {
  isIntegrationMode,
  loadBackendWorkspace,
} from "@/lib/server/localBackend";
import { loadCandidateWorkspace } from "@/lib/server/candidateWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Candidate workspace",
  description:
    "A source-linked candidate knowledge workspace for relationship-led search.",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function WorkspacePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/workspace");
  }

  if (isIntegrationMode()) {
    let workspace: Awaited<ReturnType<typeof loadBackendWorkspace>> | null =
      null;
    let integrationError: string | null = null;
    try {
      workspace = await loadBackendWorkspace();
    } catch {
      integrationError =
        "No submitted TS-CORE-01 capture is available in the account-scoped localhost backend.";
    }
    return (
      <IntegratedWorkspaceApp
        initialWorkspace={workspace}
        initialError={integrationError}
        user={{
          email: session.user.email,
          name: session.user.name,
        }}
      />
    );
  }

  const { dataset, source } = await loadCandidateWorkspace();

  return (
    <WorkspaceApp
      dataset={dataset}
      source={source}
      user={{
        email: session.user.email,
        name: session.user.name,
      }}
    />
  );
}
