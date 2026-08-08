import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeopleDirectoryApp } from "@/components/people-directory-app";
import {
  isIntegrationMode,
  loadPeopleDirectory,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "An account-scoped directory of people, relationship contexts, and governed sources.",
  robots: { follow: false, index: false },
  title: "People",
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
  try {
    people = (await loadPeopleDirectory(query)).people;
  } catch {
    error =
      "The account-scoped backend could not be reached. No relationship state is inferred from stale data.";
  }

  return (
    <PeopleDirectoryApp
      error={error}
      people={people}
      query={query}
      user={{ email: session.user.email, name: session.user.name }}
    />
  );
}
