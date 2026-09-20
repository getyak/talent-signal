import { TimeReviewRequestSchema, type TimeReviewRequest } from "@talent-signal/contracts";
import { matchesTypeBox } from "@/lib/typebox-validation";
import { reviewTimeScope } from "@/lib/server/timeWorkspace";
import { timeAccess, timeFailure, timeReply } from "@/lib/server/timeWorkspaceBoundary";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { binding } = await timeAccess(request, true);
    const body: unknown = await request.json();
    if (!matchesTypeBox(TimeReviewRequestSchema, body)) return timeReply({ message: "请填写回顾范围和问题。" }, 400);
    return timeReply({ ...await reviewTimeScope(body as TimeReviewRequest), session_version: binding });
  } catch (error) { return timeFailure(error); }
}
