import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WorkspaceApp } from "@/components/workspace-app";
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
