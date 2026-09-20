import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isSettingsSection } from "@/lib/settings-sections";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { loadAccountSettings } from "@/lib/server/accountBackend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "设置",
  description: "账号、空间与界面偏好。",
  robots: { index: false, follow: false },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  if (!(await auth())?.user) {
    redirect("/login?callbackUrl=%2Fworkspace%2Fsettings");
  }

  const requested = (await searchParams).section;
  let data: Awaited<ReturnType<typeof loadAccountSettings>> | null = null;
  try {
    data = await loadAccountSettings();
  } catch {
    /* Render no account data from fixtures or stale JWT claims. */
  }

  const labEnabled = data?.lab_enabled === true;
  let section = isSettingsSection(requested) ? requested : "account";
  if (section === "testing" && !labEnabled) section = "account";

  let sessionVersion: string | null = null;
  try {
    const claims = await readBackendSessionClaims();
    if (claims && !backendSessionIsExpired(claims.backendExpiresAt)) {
      sessionVersion = contactHandoffSessionVersion(claims);
    }
  } catch {
    /* An unreadable session leaves the preference pane read-only, not faked. */
  }

  return (
    <SettingsWorkspace
      initial={data}
      labEnabled={labEnabled}
      section={section}
      sessionVersion={sessionVersion}
    />
  );
}
