import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PursuitTodayPage } from "@/components/pursuit-today-page";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import {
  isPursuitIntegrationMode,
  loadPursuitToday,
} from "@/lib/server/pursuitBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "Governed Pursuit attention, pending review, owned actions, and bounded Agent work.",
  robots: { follow: false, index: false },
  title: "Today",
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fworkspace%2Ftoday");
  }
  if (!isPursuitIntegrationMode()) redirect("/workspace");

  const parameters = await searchParams;
  const expanded = parameters.view === "all";
  let data: Awaited<ReturnType<typeof loadPursuitToday>> | null = null;
  let error: string | null = null;
  let sessionRecoveryHref: string | null = null;
  try {
    data = await loadPursuitToday({ expanded });
  } catch (caught) {
    if (isBackendSessionExpiredError(caught)) {
      error = caught.message;
      sessionRecoveryHref = backendSessionRecoveryHref("/workspace/today");
    } else {
      error =
        "The account-scoped Pursuit API could not be verified. Cached or fixture state was not substituted.";
    }
  }

  return (
    <PursuitTodayPage
      error={error}
      expanded={expanded}
      projection={data?.projection ?? null}
      providerMode={data?.providerMode ?? "safe_deterministic"}
      sessionRecoveryHref={sessionRecoveryHref}
    />
  );
}
