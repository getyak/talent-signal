import { NextResponse } from "next/server";
import { loadTimeSchedule } from "@/lib/server/timeWorkspace";
import { timeAccess, timeFailure, timeNoStore, timeReply } from "@/lib/server/timeWorkspaceBoundary";
import { isWorkspaceSessionId } from "@/lib/server/workspaceSessions";
import { timeScheduleFile } from "@/lib/time-schedule-file";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await timeAccess(request, true);
    const { id } = await context.params;
    const body = await request.json();
    if (!isWorkspaceSessionId(id) || !body || Object.keys(body).length !== 1 || !Number.isInteger(body.expected_revision) || body.expected_revision < 1) return timeReply({ message: "导出参数无效。" }, 400);
    const { schedule } = await loadTimeSchedule(id);
    if (schedule.revision !== body.expected_revision || !schedule.content_available || schedule.status !== "planned") return timeReply({ message: "安排已改变，请重新读取后导出。", code: "schedule_export_conflict" }, 409);
    return new NextResponse(timeScheduleFile(schedule), { headers: { ...timeNoStore, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="talent-signal-${id}.ics"` } });
  } catch (error) { return timeFailure(error); }
}
