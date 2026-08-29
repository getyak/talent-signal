import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeopleDirectoryApp } from "@/components/people-directory-app";
import {
  backendSessionRecoveryHref,
  isBackendSessionExpiredError,
} from "@/lib/backend-session";
import {
  isIntegrationMode,
  loadPeopleDirectory,
  searchPeopleDirectory,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "账号专属的联系人、关系情境与受治理来源目录。",
  robots: { follow: false, index: false },
  title: "联系人",
};

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fworkspace%2Fpeople");
  }

  if (!isIntegrationMode()) {
    redirect("/workspace");
  }

  const parameters = await searchParams;
  const query = (parameters.query ?? "").normalize("NFKC").trim().slice(0, 160);
  let people: Awaited<ReturnType<typeof loadPeopleDirectory>>["people"] = [];
  let error: string | null = null;
  let sessionRecoveryHref: string | null = null;
  try {
    people = (
      await (query
        ? searchPeopleDirectory(query)
        : loadPeopleDirectory())
    ).people;
  } catch (caught) {
    if (isBackendSessionExpiredError(caught)) {
      error = caught.message;
      sessionRecoveryHref = backendSessionRecoveryHref(
        query
          ? `/workspace/people?query=${encodeURIComponent(query)}`
          : "/workspace/people",
      );
    } else {
      error =
        "无法连接账号专属后端；系统不会从陈旧数据推断关系状态。";
    }
  }

  return (
    <PeopleDirectoryApp
      error={error}
      people={people}
      query={query}
      sessionRecoveryHref={sessionRecoveryHref}
    />
  );
}
