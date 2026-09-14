import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SystemHealthDiagnostics } from "@/components/system-health-diagnostics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "系统检测",
  robots: { index: false, follow: false },
};

export default async function SystemHealthPage() {
  if (!(await auth())?.user) {
    redirect(
      "/login?callbackUrl=%2Fworkspace%2Fsettings%2Fdiagnostics",
    );
  }
  return <SystemHealthDiagnostics />;
}
