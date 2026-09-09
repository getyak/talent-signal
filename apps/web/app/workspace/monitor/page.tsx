import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductRunMonitor } from "@/components/product-run-monitor";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运行与反馈", robots: { index: false, follow: false } };
export default async function MonitorPage() {
  if (!(await auth())?.user) redirect("/login?callbackUrl=%2Fworkspace%2Fmonitor");
  return <ProductRunMonitor />;
}
