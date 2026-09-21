import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrivateConversation } from "@/components/conversation/private-conversation";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";

export const metadata: Metadata = { title: "隐私对话", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PrivateConversationPage() {
  const claims = await readBackendSessionClaims();
  if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) redirect("/login?callbackUrl=%2Fworkspace%2Fprivate");
  const binding = contactHandoffSessionVersion(claims);
  return <PrivateConversation key={binding} binding={binding} accountId={claims.backendAccountId} />;
}
