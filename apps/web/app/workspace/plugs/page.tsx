import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy route. The connection workspace moved to /workspace/extensions where
 * both MCP directions live; captures and meeting drafts remain reachable from
 * that page's utility links.
 */
export default function PlugsPage() {
  redirect("/workspace/extensions");
}
