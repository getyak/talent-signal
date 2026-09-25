import { redirect } from "next/navigation";

import { readAuthOperation, clearStagedAuth } from "@/lib/server/stagedAuth";

export const dynamic = "force-dynamic";

/**
 * Fail-closed exit for cancelled or stale staged operations. Cookie state is
 * cleared here in a Route Handler (never during page render). Cancellation is
 * ref-specific: an old cancel can only clear the operation it was rendered
 * for, never a newer operation started meanwhile.
 */
export async function GET(request: Request): Promise<never> {
  const ref = new URL(request.url).searchParams.get("ref");
  const operation = await readAuthOperation();
  // Only the originating attempt can be cancelled: an old, missing or foreign
  // ref never clears a newer operation (availability loss).
  if (ref && operation && operation.ref === ref) {
    await clearStagedAuth();
  }
  redirect("/workspace/settings?link=error");
}
