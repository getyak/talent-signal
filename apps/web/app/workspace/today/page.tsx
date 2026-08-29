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
    "受治理的寻访关注事项、待审阅内容、已分配行动与边界明确的智能助理工作。",
  robots: { follow: false, index: false },
  title: "今日",
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
        "无法核验账号专属的寻访 API；系统没有使用缓存或测试状态替代。";
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
