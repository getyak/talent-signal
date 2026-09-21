import { TimeScopeSchema, type TimeScope } from "@talent-signal/contracts";
import { matchesTypeBox } from "@/lib/typebox-validation";
import { loadTimeActivities } from "@/lib/server/timeWorkspace";
import { timeAccess, timeFailure, timeReply } from "@/lib/server/timeWorkspaceBoundary";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { binding } = await timeAccess(request);
    const query = new URL(request.url).searchParams;
    const allowed = new Set(["from", "to", "time_zone", "person_id", "kind", "after"]);
    if ([...query.keys()].some((key) => !allowed.has(key) || query.getAll(key).length !== 1)) return timeReply({ message: "筛选参数无效。" }, 400);
    const scope = {
      from: query.get("from"), to: query.get("to"), time_zone: query.get("time_zone"),
      ...(query.has("person_id") ? { person_id: query.get("person_id") } : {}),
      ...(query.has("kind") ? { kind: query.get("kind") } : {}),
    };
    const after = query.get("after") ?? undefined;
    if (!matchesTypeBox(TimeScopeSchema, scope) || (after && (after.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(after)))) {
      return timeReply({ message: "日期或筛选条件无效。" }, 400);
    }
    return timeReply({ ...await loadTimeActivities(scope as TimeScope, after), session_version: binding });
  } catch (error) { return timeFailure(error); }
}
