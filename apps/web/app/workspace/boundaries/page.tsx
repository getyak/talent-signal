import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { WorkspaceApp } from "@/components/workspace-app";
import {
  candidateMomentumFixtures,
  type WorkspaceDataSource,
} from "@/lib/candidateMomentum";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Boundary cases",
  description:
    "Authenticated synthetic boundary cases for the Talent Signal evidence-review workspace.",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function WorkspaceBoundariesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/workspace/boundaries");
  }

  const source: WorkspaceDataSource = {
    kind: "fixture-fallback",
    label: "Frozen sample cases",
    detail:
      "These eight synthetic cases exercise the review interface only. Current backend behavior is verified separately by the runtime evaluation suite.",
  };
  return (
    <WorkspaceApp
      dataset={candidateMomentumFixtures}
      source={source}
      user={{
        email: session.user.email,
        name: session.user.name,
      }}
    />
  );
}
